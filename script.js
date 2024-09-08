const apiKey = '63b0c3c1cbcc4830e39fee2250416bf8';
const notionApiKey = 'secret_xtpMAuRfYEtXVMrBaKQtBVrUdvHp8VdCGbL8WvN40pI';
const notionDatabaseId = 'dbfd1334773d4dffa17d69bc97871b2b';

// 検索窓を10個作成する
function createSearchFields() {
    const searchContainers = document.getElementById('search-containers');
    for (let i = 0; i < 10; i++) {
        const searchContainer = document.createElement('div');
        searchContainer.classList.add('search-container');
        searchContainer.id = `container-${i}`; // 各コンテナにユニークなIDを設定

        const searchInputWrapper = document.createElement('div');
        searchInputWrapper.classList.add('search-input-wrapper');

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = '映画タイトルを検索';
        searchInput.classList.add('search-input');
        searchInput.id = `search-${i}`;

        const clearButton = document.createElement('button');
        clearButton.textContent = '✖';
        clearButton.classList.add('clear-button');
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            document.getElementById('suggestions').innerHTML = '';
            searchContainer.querySelector('.movie-details')?.remove();
        });

        searchInput.addEventListener('input', () => {
            performSearch(searchInput.value, searchContainer);
        });

        searchInputWrapper.appendChild(searchInput);
        searchInputWrapper.appendChild(clearButton);
        searchContainer.appendChild(searchInputWrapper);
        searchContainers.appendChild(searchContainer);
    }
}

createSearchFields();

// 日付を調整する関数
function adjustDate(inputId, days) {
    const dateInput = document.getElementById(inputId);
    if (dateInput.value) {
        const currentDate = new Date(dateInput.value);
        currentDate.setDate(currentDate.getDate() + days);
        dateInput.value = currentDate.toISOString().split('T')[0];
    }
}

// 「次の週」「前の週」ボタンのクリックイベントリスナー
document.getElementById('next-week-button').addEventListener('click', () => {
    adjustDate('start-date', 7);
    adjustDate('end-date', 7);
});

document.getElementById('previous-week-button').addEventListener('click', () => {
    adjustDate('start-date', -7);
    adjustDate('end-date', -7);
});

// Notionに登録されている映画のIDとその上映期間を取得する関数
async function fetchRegisteredMoviesData() {
    try {
        const response = await fetch(`https://api.notion.com/v1/databases/${notionDatabaseId}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${notionApiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
                page_size: 100, // 必要に応じてページサイズを調整
                filter: {
                    property: 'ID',
                    number: {
                        is_not_empty: true
                    }
                }
            })
        });
        if (!response.ok) throw new Error(`Notion API error: ${response.status} ${response.statusText}`);
        const data = await response.json();

        // 映画のIDとアイリス上映開始日、終了日をマッピングする
        const registeredMovies = data.results.map(page => ({
            id: page.properties['ID'].number,
            startDate: page.properties['アイリス上映開始日'].date ? page.properties['アイリス上映開始日'].date.start : '未設定',
            endDate: page.properties['アイリス上映終了日'].date ? page.properties['アイリス上映終了日'].date.start : '未設定',
            notionPageId: page.id // NotionページのIDを取得しておく
        }));

        // デバッグ用に登録されている映画のデータをコンソールに表示
        console.log('Registered Movies Data:', registeredMovies);

        return registeredMovies;
    } catch (error) {
        console.error('Error fetching registered movie data:', error);
        return [];
    }
}

// Notionの映画の開始日と終了日を更新する関数
async function updateMovieDates(pageId, newStartDate, newEndDate, currentStartDate, currentEndDate) {
    try {
        const propertiesToUpdate = {};
        let updatedFields = [];

        // 新しい開始日が既存の終了日の翌日であれば、終了日を更新
        if (newStartDate && currentEndDate) {
            const newStart = new Date(newStartDate);
            const currentEnd = new Date(currentEndDate);
            if (newStart.getTime() === currentEnd.getTime() + 24 * 60 * 60 * 1000) { // 翌日チェック
                propertiesToUpdate['アイリス上映終了日'] = { date: { start: newEndDate } };
                updatedFields.push('上映終了日');
            }
        }

        // 新しい終了日が既存の開始日の前日であれば、開始日を更新
        if (newEndDate && currentStartDate) {
            const newEnd = new Date(newEndDate);
            const currentStart = new Date(currentStartDate);
            if (newEnd.getTime() === currentStart.getTime() - 24 * 60 * 60 * 1000) { // 前日チェック
                propertiesToUpdate['アイリス上映開始日'] = { date: { start: newStartDate } };
                updatedFields.push('上映開始日');
            }
        }

        // 日付更新がある場合のみAPIリクエストを送信
        if (updatedFields.length > 0) {
            const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${notionApiKey}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                },
                body: JSON.stringify({
                    properties: propertiesToUpdate
                })
            });
            if (!response.ok) throw new Error(`Notion API error: ${response.status} ${response.statusText}`);
            console.log('Notionの上映日を更新しました:', propertiesToUpdate);

            // 更新されたフィールドに基づいてメッセージを表示
            alert(`${updatedFields.join('と')}が更新されました！`);
            
            // 更新完了後にリロードを実行
            reloadSearchResults();
            return true; // 更新が行われたことを示す
        } else {
            return false; // 更新が行われなかったことを示す
        }
    } catch (error) {
        console.error('Notion上映日更新エラー:', error);
        alert('上映日更新に失敗しました。');
        return false;
    }
}

async function updateMovieDatesWithRetry(pageId, newStartDate, newEndDate, currentStartDate, currentEndDate, retryCount = 3) {
    while (retryCount > 0) {
        try {
            const updated = await updateMovieDates(pageId, newStartDate, newEndDate, currentStartDate, currentEndDate);
            if (updated) {
                return true;
            }
        } catch (error) {
            if (error.message.includes('409')) {
                console.log('競合エラーが発生しました。リトライします...');
                retryCount--;
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
                continue;
            }
            throw error; // その他のエラーの場合は再スロー
        }
    }
    alert('更新に失敗しました。競合が解決できませんでした。');
    return false;
}


// リロードボタンのクリックイベントリスナー
document.getElementById('reload-button').addEventListener('click', reloadSearchResults);

// 全てクリアボタンのクリックイベントリスナー
document.getElementById('clear-all-button').addEventListener('click', () => {
    const searches = document.querySelectorAll('.search-input');
    searches.forEach(search => {
        search.value = '';
        document.getElementById('suggestions').innerHTML = '';
        search.parentElement.querySelector('.movie-details')?.remove();
    });
});

// 一括登録ボタンの処理
document.getElementById('register-all-button').addEventListener('click', () => {
    const movieDetailsElements = document.querySelectorAll('.movie-details');
    movieDetailsElements.forEach(details => {
        const movieId = details.getAttribute('data-movie-id');
        const movieTitle = details.getAttribute('data-movie-title');
        const thumbnailUrl = details.getAttribute('data-thumbnail-url');
        const notionPageId = details.getAttribute('data-notion-page-id');
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;

        if (startDate && endDate && movieId) { // movieIdのチェックを追加
            registerSelectedMovie(movieId, movieTitle, thumbnailUrl, notionPageId, startDate, endDate);
        } else {
            alert('映画ID、アイリス上映開始日、または終了日が設定されていません。');
        }
    });
});

// 検索結果をリロードする関数
function reloadSearchResults() {
    const searches = document.querySelectorAll('.search-input');
    searches.forEach(search => performSearch(search.value, search.parentElement));
}

function performSearch(query, container) {
    if (query.length > 2) {
        // 既存の登録済み映画のデータを取得
        fetchRegisteredMoviesData().then(registeredMovies => {

            fetch(`https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${query}&language=ja-JP&region=JP`)
                .then(response => response.json())
                .then(data => {
                    const movieDetailsPromises = data.results.map(movie =>
                        fetch(`https://api.themoviedb.org/3/movie/${movie.id}?api_key=${apiKey}&language=ja-JP&append_to_response=credits,videos,images`)
                            .then(response => response.json())
                    );

                    Promise.all(movieDetailsPromises).then(movies => {
                        const suggestions = movies.map(movie => {
                            const director = movie.credits.crew.find(person => person.job === '監督' || person.job === 'Director');
                            const mainCast = movie.credits.cast.slice(0, 3).map(actor => actor.name).join(', ');
                            const trailer = movie.videos.results.find(video => video.type === 'Trailer' && video.site === 'YouTube');
                            const trailerUrl = trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : '予告未登録';

                            // タイトルとオリジナルタイトルの表示 (和名や和訳を括弧書きで表示)
                            const displayTitle = movie.title !== movie.original_title
                                ? `${movie.title} (${movie.original_title})`
                                : movie.title;

                            // サムネイル画像のURLを保持
                            const thumbnailUrl = `https://image.tmdb.org/t/p/w92${movie.poster_path}`;

                            // 登録済みのタグと上映期間の表示
                            const registeredMovie = registeredMovies.find(registered => registered.id === movie.id);
                            const registeredTag = registeredMovie 
                                ? `<span class="tag-registered">登録済み - アイリス上映開始: ${registeredMovie.startDate}, 終了: ${registeredMovie.endDate}</span>`
                                : '';

                            return `
                                <div class="suggestion-item" onclick="confirmMovie('${movie.id}', '${movie.title}', '${thumbnailUrl}', '${registeredMovie ? registeredMovie.notionPageId : ''}', '${container.id}')">
                                    <img src="${thumbnailUrl}" alt="${movie.title}" class="thumbnail">
                                    <div>
                                        <span><strong>タイトル:</strong> ${displayTitle}</span> ${registeredTag}<br>
                                        <span><strong>公開日:</strong> ${movie.release_date}</span><br>
                                        <span><strong>監督:</strong> ${director ? director.name : '監督未登録'}</span><br>
                                        <span><strong>主演:</strong> ${mainCast || '主演未登録'}</span><br>
                                        <span><strong>概要:</strong> ${movie.overview || '概要未登録'}</span><br>
                                        <span><strong>予告編:</strong> <a href="${trailerUrl}" target="_blank">${trailerUrl !== '予告未登録' ? 'YouTube' : '予告未登録'}</a></span><br>
                                        <span><strong>ユーザースコア:</strong> ${movie.vote_average || 'ユーザースコア不明'}</span>
                                    </div>
                                </div>
                            `;
                        }).join('');
                        document.getElementById('suggestions').innerHTML = suggestions;
                    });
                });
        });
    } else {
        document.getElementById('suggestions').innerHTML = '';
    }
}

function confirmMovie(movieId, movieTitle, thumbnailUrl, notionPageId, containerId) {
    // コンテナ要素を取得
    const container = document.getElementById(containerId);

    // コンテナが存在するか確認
    if (!container) {
        console.error(`コンテナが見つかりません: ID = ${containerId}`);
        return;
    }

    
    // 既に表示されている映画情報を削除
    const existingDetails = container.querySelector('.movie-details');
    if (existingDetails) {
        existingDetails.remove();
    }

    // 映画情報を表示
    
    // 映画情報を表示
    const movieDetails = document.createElement('div');
    movieDetails.classList.add('movie-details');
    movieDetails.setAttribute('data-movie-id', movieId); // 映画IDを設定
    movieDetails.setAttribute('data-movie-title', movieTitle);
    movieDetails.setAttribute('data-thumbnail-url', thumbnailUrl);
    movieDetails.setAttribute('data-notion-page-id', notionPageId);
    
    // Notionに既に登録されているかを確認してタグを表示
    const registeredTag = notionPageId 
        ? `<span class="tag-registered">登録済み</span>`
        : '';

    movieDetails.innerHTML = `
        <strong>選択中の映画:</strong><br>
        <strong>タイトル:</strong> ${movieTitle} ${registeredTag}<br>
        <img src="${thumbnailUrl}" alt="${movieTitle}" style="max-width: 100px;"><br>
        <button onclick="registerSelectedMovie('${movieId}', '${movieTitle}', '${thumbnailUrl}', '${notionPageId}')">登録</button>
    `;

    container.appendChild(movieDetails);
}

function registerSelectedMovie(movieId, movieTitle, thumbnailUrl, notionPageId) {
    // 日付が未入力の場合、エラーメッセージを表示して登録を中止
    const startDate = document.getElementById('start-date')?.value || null;
    const endDate = document.getElementById('end-date')?.value || null;

    if (!startDate || !endDate) {
        alert('アイリス上映開始日と終了日を入力してください。');
        return;
    }

    // Notionに既に登録されているかを確認し、上映日を更新するか新規登録するかを判断
    fetchRegisteredMoviesData().then(registeredMovies => {
        const registeredMovie = registeredMovies.find(registered => registered.id === parseInt(movieId));

        if (registeredMovie) {
            // 既存の映画が見つかった場合、上映日を更新
            updateMovieDates(
                registeredMovie.notionPageId,
                startDate,
                endDate,
                registeredMovie.startDate,
                registeredMovie.endDate
            ).then(updated => {
                // 上映日の更新が行われなかった場合、新規に登録
                if (!updated) {
                    registerNewMovie(movieId, movieTitle, thumbnailUrl, startDate, endDate);
                }
            });
        } else {
            // 映画が見つからなかった場合、新規に登録
            registerNewMovie(movieId, movieTitle, thumbnailUrl, startDate, endDate);
        }
    });
}

function registerNewMovie(movieId, movieTitle, thumbnailUrl, startDate, endDate) {
    fetch(`https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=ja-JP&append_to_response=credits,videos,images`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`TMDb APIエラー: ${response.status} ${response.statusText}`);
            }
            console.log('TMDbから映画の情報を正常に取得しました');
            return response.json();
        })
        .then(movie => {
            console.log('映画情報:', movie);

            const director = movie.credits.crew.find(person => person.job === '監督' || person.job === 'Director');
            const mainCast = movie.credits.cast.slice(0, 3).map(actor => actor.name);
            const trailer = movie.videos.results.find(video => video.type === 'Trailer' && video.site === 'YouTube');
            const trailerUrl = trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : '予告未登録';

            // メイン画像としてのサムネイルを設定
            const posterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;

            // 追加の画像を取得
            const additionalImages = movie.images.backdrops.map(image => ({
                type: 'external',
                name: 'Image',
                external: { url: `https://image.tmdb.org/t/p/w500${image.file_path}` }
            }));

            // メディアプロパティにサムネイルと追加画像を設定
            const mediaProperties = [
                {
                    type: 'external',
                    name: 'Thumbnail',
                    external: { url: thumbnailUrl } // サムネイル画像を設定
                },
                {
                    type: 'external',
                    name: 'Poster',
                    external: { url: posterUrl } // メインポスター画像を設定
                },
                ...additionalImages // 追加の画像を設定
            ];

            console.log('監督:', director ? director.name : '監督未登録');
            console.log('主演キャスト:', mainCast);
            console.log('予告編URL:', trailerUrl);
            console.log('ユーザースコア:', movie.vote_average);
            console.log('アイリス上映開始日:', startDate);
            console.log('アイリス上映終了日:', endDate);

            // Notion APIへのリクエスト
            const notionPayload = {
                parent: { database_id: notionDatabaseId },
                cover: {
                    type: 'external',
                    external: { url: thumbnailUrl } // サムネイル画像をカバー画像に設定
                },
                properties: {
                    'タイトル': {
                        title: [{ text: { content: movie.title } }]
                    },
                    '概要': {
                        rich_text: [{ text: { content: movie.overview || '概要未登録' } }]
                    },
                    '全国上映開始日': {
                        date: { start: movie.release_date || null } // 全国上映開始日を日付形式で設定
                    },
                    '上映時間': {
                        number: movie.runtime || 0
                    },
                    '監督': {
                        multi_select: director ? [{ name: director.name }] : []
                    },
                    'キャスト': {
                        multi_select: mainCast.map(actor => ({ name: actor }))
                    },
                    'URL': {
                        url: `https://www.themoviedb.org/movie/${movieId}`
                    },
                    'ID': {
                        number: parseInt(movieId) // 数値型としてIDを設定
                    },
                    '予告編': {
                        url: trailerUrl // 予告編URLを設定
                    },
                    'ユーザースコア': {
                        number: movie.vote_average // ユーザースコアを数値として設定
                    },
                    'アイリス上映開始日': {
                        date: { start: startDate } // アイリス上映開始日
                    },
                    'アイリス上映終了日': {
                        date: { start: endDate } // アイリス上映終了日
                    },
                    '画像': {
                        files: mediaProperties // サムネイルとメイン画像を含む全ての画像を設定
                    }
                }
            };

            console.log('Notionに送信するペイロード:', JSON.stringify(notionPayload, null, 2));

            return fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${notionApiKey}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                },
                body: JSON.stringify(notionPayload)
            });
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    console.error('Notion APIエラーの詳細:', data); // 詳細なエラーメッセージを表示
                    throw new Error(`Notion APIエラー: ${response.status} ${response.statusText}`);
                });
            }
            console.log('Notionへの登録に成功しました');
            alert(`${movieTitle} を登録しました！`);

            // 登録完了後にリロードを実行
            reloadSearchResults();
        })
        .catch(error => {
            console.error('エラーが発生しました:', error);
            alert(`登録中にエラーが発生しました。詳細はコンソールを確認してください。: ${error.message}`);
        });
}
