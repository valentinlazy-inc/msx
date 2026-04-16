(function() {
    'use strict';

    const TOKEN = '75w72xctw7byhm3g';   // ← Обязательно замени!

    const network = new Lampa.Reguest();
    const LIMIT = 30;   // Количество аниме на одной странице

    function getHeaders() {
        return {
            'X-Application': TOKEN,
            'Accept': 'application/json'
        };
    }

    Lampa.Component.add('yummy_catalog', {
        template: `
            <div class="yummy-container">
                <div class="search-box" style="margin-bottom:15px;">
                    <input type="text" class="search-input" placeholder="Поиск аниме..." 
                           style="width:100%; padding:14px; border-radius:8px; background:#1f1f1f; color:white; border:none; font-size:15px;">
                </div>

                <div class="cards-container" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(145px,1fr)); gap:16px;"></div>

                <div class="pagination" style="margin-top:25px; text-align:center; display:flex; justify-content:center; gap:15px; align-items:center; flex-wrap:wrap;">
                    <button class="btn-prev" style="padding:10px 18px; background:#333; color:white; border:none; border-radius:6px; cursor:pointer;">← Предыдущая</button>
                    <span class="page-info" style="color:#ccc; min-width:120px;">Страница <b>1</b></span>
                    <button class="btn-next" style="padding:10px 18px; background:#333; color:white; border:none; border-radius:6px; cursor:pointer;">Следующая →</button>
                </div>
            </div>
        `,

        onCreate: function() {
            const self = this;
            const $container = self.node.find('.cards-container');
            const $input = self.node.find('.search-input');
            const $btnPrev = self.node.find('.btn-prev');
            const $btnNext = self.node.find('.btn-next');
            const $pageInfo = self.node.find('.page-info');

            let currentPage = 1;
            let currentQuery = '';
            let isLoading = false;
            let totalItems = 0;   // Будем пытаться определять, есть ли ещё страницы

            function renderCards(items) {
                let html = '';
                items.forEach(item => {
                    const poster = item.poster ? (item.poster.big || item.poster.medium || item.poster.small || item.image || '') : '';
                    const title = item.title_ru || item.title || 'Без названия';
                    const year = item.year ? item.year : '';
                    const rating = item.rating && item.rating.average ? `★ ${item.rating.average.toFixed(1)}` : '';

                    html += `
                        <div class="card" data-id="${item.id || item.anime_id}" style="cursor:pointer; border-radius:8px; overflow:hidden; background:#2a2a2a;">
                            <img src="${poster}" alt="${title}" style="width:100%; height:210px; object-fit:cover;" 
                                 onerror="this.src='https://via.placeholder.com/145x210?text=No+Poster'">
                            <div style="padding:8px 6px;">
                                <div class="card-title" style="font-size:14px; line-height:1.35; height:42px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${title}</div>
                                <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#aaa; margin-top:4px;">
                                    ${year ? `<span>${year}</span>` : ''}
                                    ${rating ? `<span>${rating}</span>` : ''}
                                </div>
                            </div>
                        </div>`;
                });

                $container.html(html);

                $container.find('.card').on('click', function() {
                    const id = $(this).data('id');
                    const title = $(this).find('.card-title').text();
                    self.openAnime(id, title);
                });
            }

            function updatePagination() {
                $pageInfo.html(`Страница <b>${currentPage}</b>`);
                $btnPrev.prop('disabled', currentPage === 1);
                // Кнопка "Далее" всегда активна (API не всегда отдаёт total), но если результатов меньше LIMIT — можно отключить
            }

            function loadPage(page, query = '') {
                if (isLoading) return;
                isLoading = true;

                $btnPrev.prop('disabled', true);
                $btnNext.prop('disabled', true);

                currentPage = page;
                currentQuery = query;

                let url = 'https://api.yani.tv/anime';
                let params = `?limit=${LIMIT}&offset=${(page - 1) * LIMIT}`;

                if (query) {
                    url = `https://api.yani.tv/search`;
                    params = `?q=${encodeURIComponent(query)}&limit=${LIMIT}&offset=${(page - 1) * LIMIT}`;
                }

                network.silent(url + params, function(json) {
                    isLoading = false;
                    const items = json.response || json.data || json || [];

                    renderCards(items);
                    updatePagination();

                    // Если вернулось меньше LIMIT — скорее всего последняя страница
                    $btnNext.prop('disabled', items.length < LIMIT);
                }, function(err) {
                    isLoading = false;
                    Lampa.Noty.show('Ошибка загрузки: ' + (err || ''));
                    updatePagination();
                }, false, getHeaders());
            }

            // Поиск с задержкой
            let searchTimeout;
            $input.on('input', function() {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    const val = $(this).val().trim();
                    currentPage = 1;
                    loadPage(1, val);
                }, 450);
            });

            // Кнопки пагинации
            $btnPrev.on('click', function() {
                if (currentPage > 1) loadPage(currentPage - 1, currentQuery);
            });

            $btnNext.on('click', function() {
                loadPage(currentPage + 1, currentQuery);
            });

            // Первая загрузка
            loadPage(1, '');
        },

        // Открытие аниме и плеер
        openAnime: function(id, title) {
            network.silent(
                `https://api.yani.tv/anime/${id}/videos`,
                function(data) {
                    const videos = data.response || data || [];

                    if (!videos || videos.length === 0) {
                        Lampa.Noty.show('Видео не найдены');
                        return;
                    }

                    const playlist = videos.map((ep, i) => ({
                        title: `Серия ${i + 1} — ${ep.title || 'Без названия'}`,
                        file: ep.url || ep.src || ep.player || ep.iframe_url || '',
                        quality: ep.quality || '720p'
                    })).filter(ep => ep.file);

                    if (!playlist.length) {
                        Lampa.Noty.show('Не удалось получить ссылки на видео');
                        return;
                    }

                    Lampa.Player.play({
                        playlist: playlist,
                        title: title || 'YummyAnime'
                    });
                },
                function() {
                    Lampa.Noty.show('Ошибка загрузки серий');
                },
                false,
                getHeaders()
            );
        }
    });

    // Добавление в меню
    Lampa.Listener.send('app', 'ready', function() {
        Lampa.SettingsApi.addComponent('yummyanime', {
            title: '🍣 YummyAnime',
            icon: 'https://yummyanime.tv/favicon.ico',
            component: 'yummy_catalog'
        });
    });

    console.log('✅ YummyAnime плагин с поиском и пагинацией загружен');
})();
