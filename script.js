const apiKey = '63b0c3c1cbcc4830e39fee2250416bf8';
const notionApiKey = 'secret_xtpMAuRfYEtXVMrBaKQtBVrUdvHp8VdCGbL8WvN40pI';
const notionDatabaseId = 'dbfd1334773d4dffa17d69bc97871b2b';

document.getElementById('search').addEventListener('input', function () {
    const query = this.value;
    if (query.length > 2) {
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
                        const trailerUrl = trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : '情報なし';

                        // タイトルとオリジナルタイトルの表示 (和名や和訳を括弧書きで表示)
                        const displayTitle = movie.title !== movie.original_title
                            ? `${movie.title} (${movie.original_title})`
                            : movie.title;

                        // サムネイル画像のURLを保持
                        const thumbnailUrl = `https://image.tmdb.org/t/p/w92${movie.poster_path}`;

                        return `
                            <div class="suggestion-item" onclick="selectMovie('${movie.id}', '${movie.title}', '${thumbnailUrl}')">
                                <img src="${thumbnailUrl}" alt="${movie.title}" class="thumbnail">
                                <div>
                                    <span><strong>タイトル:</strong> ${displayTitle}</span><br>
                                    <span><strong>公開日:</strong> ${movie.release_date}</span><br>
                                    <span><strong>監督:</strong> ${director ? director.name : '情報なし'}</span><br>
                                    <span><strong>主演:</strong> ${mainCast || '情報なし'}</span><br>
                                    <span><strong>概要:</strong> ${movie.overview || '情報なし'}</span><br>
                                    <span><strong>予告編:</strong> <a href="${trailerUrl}" target="_blank">${trailerUrl !== '情報なし' ? 'YouTube' : '情報なし'}</a></span><br>
                                    <span><strong>ユーザースコア:</strong> ${movie.vote_average || '情報なし'}</span>
                                </div>
                            </div>
                        `;
                    }).join('');
                    document.getElementById('suggestions').innerHTML = suggestions;
                });
            });
    } else {
        document.getElementById('suggestions').innerHTML = '';
    }
});

function selectMovie(movieId, movieTitle, thumbnailUrl) {
    console.log(`開始: 映画ID ${movieId} の情報を取得します`);

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
            const trailerUrl = trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : '情報なし';

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

            // 放映期間の取得
            const startDate = document.getElementById('start-date').value;
            const endDate = document.getElementById('end-date').value;

            console.log('監督:', director ? director.name : '情報なし');
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
                        rich_text: [{ text: { content: movie.overview || '情報なし' } }]
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
                        date: { start: startDate || null } // アイリス上映開始日
                    },
                    'アイリス上映終了日': {
                        date: { start: endDate || null } // アイリス上映終了日
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
        })
        .catch(error => {
            console.error('エラーが発生しました:', error);
            alert(`登録中にエラーが発生しました。詳細はコンソールを確認してください。: ${error.message}`);
        });
}
