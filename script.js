const apiKey = '63b0c3c1cbcc4830e39fee2250416bf8';
const notionApiKey = 'secret_xtpMAuRfYEtXVMrBaKQtBVrUdvHp8VdCGbL8WvN40pI';
const notionDatabaseId = 'dbfd1334773d4dffa17d69bc97871b2b';
let selectedMovie = null;  // 確定された映画情報を保存

// 検索窓を10個作成する
function createSearchFields() {
    const searchContainers = document.getElementById('search-containers');
    for (let i = 0; i < 10; i++) {
        const searchContainer = document.createElement('div');
        searchContainer.classList.add('search-container');

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
        });

        searchInput.addEventListener('input', () => {
            performSearch(searchInput.value, searchInput.id);
        });

        searchContainer.appendChild(searchInput);
        searchContainer.appendChild(clearButton);
        searchContainers.appendChild(searchContainer);
    }
}

createSearchFields();

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
async function updateMovieDates(pageId, newStartDate, newEndDate) {
    try {
        const propertiesToUpdate = {};
        let updatedFields = [];

        if (newStartDate) {
            propertiesToUpdate['アイリス上映開始日'] = { date: { start: newStartDate } };
            updatedFields.push('上映開始日');
        }
        if (newEndDate) {
            propertiesToUpdate['アイリス上映終了日'] = { date: { start: newEndDate } };
            updatedFields.push('上映終了日');
        }
        
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
        if (updatedFields.length > 0) {
            alert(`${updatedFields.join('と')}が更新されました！`);
        } else {
            alert('上映日が更新されましたが、どのフィールドが更新されたかは不明です。');
        }

        // 更新完了後に情報を再取得
        performSearch(document.getElementById('search').value);
    } catch (error) {
        console.error('Notion上映日更新エラー:', error);
        alert('上映日更新に失敗しました。');
    }
}

// リロードボタンのクリックイベントリスナー
document.getElementById('reload-button').addEventListener('click', () => {
    const searches = document.querySelectorAll('.search-input');
    searches.forEach(search => performSearch(search.value, search.id));
});

// 全てクリアボタンのクリックイベントリスナー
document.getElementById('clear-all-button').addEventListener('click', () => {
    const searches = document.querySelectorAll('.search-input');
    searches.forEach(search => {
        search.value = '';
        document.getElementById('suggestions').innerHTML = '';
    });
});

function performSearch(query, inputId) {
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
                                <div class="suggestion-item" onclick="confirmMovie('${movie.id}', '${movie.title}', '${thumbnailUrl}', '${registeredMovie ? registeredMovie.notionPageId : ''}')">
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

function confirmMovie(movieId, movieTitle, thumbnailUrl, notionPageId) {
    // 確定した映画情報を保存
    selectedMovie = {
        movieId,
        movieTitle,
        thumbnailUrl,
        notionPageId
    };
    alert(`${movieTitle} が選択されました。登録するには「登録」ボタンを押してください。`);
}

// 「登録」ボタンを追加
const registerButton = document.createElement('button');
registerButton.textContent = '登録';
registerButton.id = 'register-button';
registerButton.style.display = 'none'; // 最初は非表示
registerButton.addEventListener('click', () => {
    if (!selectedMovie) {
        alert('登録する映画を選択してください。');
        return;
    }

    // 日付が未入力の場合、エラーメッセージを表示して登録を中止
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    if (!startDate || !endDate) {
        alert('アイリス上映開始日と終了日を入力してください。');
        return;
    }

    // Notionに映画を登録する
    registerNewMovie(selectedMovie.movieId, selectedMovie.movieTitle, selectedMovie.thumbnailUrl, startDate, endDate);
});

// ボタンをページに追加
document.body.appendChild(registerButton);

// 作品を選択したときにボタンを表示
function displayRegisterButton() {
    const registerButton = document.getElementById('register-button');
    if (selectedMovie) {
        registerButton.style.display = 'block';
    } else {
        registerButton.style.display = 'none';
    }
}

function selectMovie(movieId, movieTitle, thumbnailUrl, notionPageId) {
    // 確定した映画情報をセット
    selectedMovie = {
        movieId,
        movieTitle,
        thumbnailUrl,
        notionPageId
    };
    displayRegisterButton();
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

            // 登録完了後に情報を再取得
            performSearch(document.getElementById('search').value);
        })
        .catch(error => {
            console.error('エラーが発生しました:', error);
            alert(`登録中にエラーが発生しました。詳細はコンソールを確認してください。: ${error.message}`);
        });
}
