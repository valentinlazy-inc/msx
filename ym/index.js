(function () {
    'use strict';

    var SOURCE_NAME = 'yummyanime';
    var SOURCE_TITLE = 'YummyAnime';
    var VERSION = '2026-04-17-3';
    var TOKEN = '75w72xctw7byhm3g';
    var LIMIT = 30;
    var PAGE_SIZE = 80;
    var VIDEO_PAGE_SIZE = 40;
    var CVH_SCRIPT = 'https://player.cdnvideohub.com/s2/stable/video-player.umd.js';
    var DEBUG = true;
    var USE_LAMPA_TEMPLATES = false;
    var initTries = 0;
    var initTimer;
    var templatesUnavailable = {};

    window.yummyanime_log = window.yummyanime_log || [];

    function log(message, visible, forceVisible) {
        var text = '[' + SOURCE_TITLE + '] ' + message;

        window.yummyanime_log.push({
            time: new Date().toISOString(),
            message: message
        });

        if (window.console && console.log) console.log(text);

        if (visible && (DEBUG || forceVisible) && window.Lampa && Lampa.Noty && Lampa.Noty.show) {
            Lampa.Noty.show(text);
        }
    }

    function fail(message, error) {
        var details = error && (error.stack || error.message || error.statusText || error.status || error);
        log(message + (details ? ': ' + details : ''), true, true);
        if (window.console && console.error) console.error('[' + SOURCE_TITLE + ']', message, error || '');
    }

    function requestHeaders() {
        return {
            'X-Application': TOKEN,
            'Accept': 'application/json'
        };
    }

    function normalizeList(data) {
        if (!data) return [];
        if (data.response && data.response.items) return data.response.items;
        if (data.response && data.response.data) return data.response.data;
        if (data.response) return data.response;
        if (data.data && data.data.items) return data.data.items;
        if (data.data) return data.data;
        if (data.items) return data.items;
        return data;
    }

    function asArray(data) {
        var list = normalizeList(data);
        return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
    }

    function itemTitle(item) {
        return item.title_ru || item.title || item.name || item.original_title || 'Без названия';
    }

    function itemId(item) {
        return item.id || item.anime_id || item.shikimori_id || item.slug;
    }

    function labelFromValue(value) {
        var keys;
        var labels = [];

        if (value === null || typeof value === 'undefined') return '';

        if (typeof value === 'string' || typeof value === 'number') return String(value);

        if (Object.prototype.toString.call(value) === '[object Array]') {
            value.forEach(function (entry) {
                var label = labelFromValue(entry);
                if (label) labels.push(label);
            });

            return labels.slice(0, 4).join(', ');
        }

        if (typeof value === 'object') {
            if (value.title_ru) return value.title_ru;
            if (value.title) return value.title;
            if (value.name_ru) return value.name_ru;
            if (value.name) return value.name;
            if (value.label) return value.label;
            if (value.value && typeof value.value !== 'object') return String(value.value);

            keys = Object.keys(value);

            keys.forEach(function (key) {
                var entry = value[key];

                if (entry === true) labels.push(key);
                else if (typeof entry === 'string' || typeof entry === 'number') labels.push(String(entry));
            });

            return labels.slice(0, 4).join(', ');
        }

        return '';
    }

    function dubbingTitle(item) {
        var data = item.data || {};
        var label = labelFromValue(data.dubbing || item.dubbing || item.translation || item.voice);

        return label || 'Без озвучки';
    }

    function groupByDubbing(items) {
        var map = {};
        var groups = [];

        items.forEach(function (item) {
            var title = dubbingTitle(item);

            if (!map[title]) {
                map[title] = {
                    title: title,
                    items: []
                };

                groups.push(map[title]);
            }

            map[title].items.push(item);
        });

        groups.sort(function (a, b) {
            return b.items.length - a.items.length;
        });

        return groups;
    }

    function videoUrl(video) {
        return video.url || video.src || video.file || video.link || video.player || video.iframe_url || '';
    }

    function absoluteUrl(url) {
        if (!url) return '';
        if (url.indexOf('//') === 0) return 'https:' + url;
        if (url.indexOf('/') === 0) return 'https://ru.yummyani.me' + url;
        return url;
    }

    function isIframeUrl(url) {
        return url.indexOf('iframe') >= 0 || url.indexOf('yummyani.me') >= 0 || url.indexOf('kodikplayer.com') >= 0;
    }

    function queryValue(url, key) {
        var query = (url.split('?')[1] || '').split('#')[0];
        var parts = query.split('&');
        var i;
        var part;
        var name;
        var value;

        for (i = 0; i < parts.length; i++) {
            part = parts[i].split('=');
            name = decodeURIComponent((part[0] || '').replace(/\+/g, ' '));

            if (name === key) {
                value = part.slice(1).join('=');
                return decodeURIComponent((value || '').replace(/\+/g, ' '));
            }
        }

        return '';
    }

    function loadScriptOnce(src, callback, error) {
        var exists = document.querySelector('script[data-yummyanime-src="' + src + '"]');
        var script;
        var onLoad;
        var onError;

        if (exists && exists.getAttribute('data-loaded') === 'true') {
            log('Скрипт уже загружен: ' + src);
            callback();
            return;
        }

        if (exists) {
            onLoad = function () {
                exists.removeEventListener('load', onLoad, false);
                exists.removeEventListener('error', onError, false);
                callback();
            };
            onError = function () {
                exists.removeEventListener('load', onLoad, false);
                exists.removeEventListener('error', onError, false);
                error();
            };
            exists.addEventListener('load', onLoad, false);
            exists.addEventListener('error', onError, false);
            return;
        }

        script = document.createElement('script');
        log('Загружаю скрипт: ' + src);
        script.src = src;
        script.async = true;
        script.setAttribute('data-yummyanime-src', src);
        script.onload = function () {
            script.setAttribute('data-loaded', 'true');
            callback();
        };
        script.onerror = error;
        document.head.appendChild(script);

        setTimeout(function () {
            if (script.getAttribute('data-loaded') !== 'true') {
                log('Скрипт еще не загрузился через 8 секунд: ' + src, true);
            }
        }, 8000);
    }

    function openCvhPlayer(url, title) {
        var animeId = queryValue(url, 'anime_id');
        var episode = queryValue(url, 'episode');
        var dubbingCode = queryValue(url, 'dubbing_code');
        var layer;
        var player;

        if (!animeId || !episode) return false;

        log('CVH: открываю anime_id=' + animeId + ', episode=' + episode + ', voice=' + (dubbingCode || ''));

        layer = $('<div class="yummyanime-player" style="position:fixed;left:0;top:0;width:100%;height:100%;background:#000;z-index:99999;">' +
            '<div style="position:absolute;left:0;right:0;top:0;padding:1em;color:#fff;background:linear-gradient(rgba(0,0,0,.65),rgba(0,0,0,0));font-size:1.1em;z-index:2;"></div>' +
            '<div class="yummyanime-player__body" style="position:absolute;left:0;top:0;width:100%;height:100%;"></div>' +
            '</div>');

        layer.children().eq(0).text(title || SOURCE_TITLE);

        function close() {
            log('CVH: закрыт');
            layer.remove();
            if (Lampa.Controller) Lampa.Controller.toggle('content');
        }

        function mount() {
            log('CVH: скрипт загружен, монтирую плеер');
            player = document.createElement('video-player');
            player.id = 'yummyanime-cvh-player';
            player.setAttribute('priority-voice', dubbingCode || '');
            player.setAttribute('episode', episode);
            player.setAttribute('data-aggregator', 'mali');
            player.setAttribute('data-title-id', animeId);
            player.setAttribute('data-publisher-id', '745');
            player.setAttribute('is-show-voice-only', 'true');
            player.setAttribute('style', 'width:100%;height:100%;display:block;');
            player.style.display = 'block';
            player.style.width = '100%';
            player.style.height = '100%';

            layer.find('.yummyanime-player__body')[0].appendChild(player);

            setTimeout(function () {
                var body = layer.find('.yummyanime-player__body')[0];
                var shadow = player.shadowRoot || player.shadow;
                log('CVH: player children=' + body.children.length + ', shadow=' + (shadow ? 'yes' : 'no'));
            }, 2000);
        }

        $('body').append(layer);

        if (Lampa.Controller) {
            Lampa.Controller.add('yummyanime_player', {
                invisible: true,
                toggle: function () {},
                back: close,
                stop: close
            });
            Lampa.Controller.toggle('yummyanime_player');
        }

        loadScriptOnce(CVH_SCRIPT, mount, function () {
            close();
            fail('Не удалось загрузить CVH-плеер');
        });

        return true;
    }

    function videoTitle(video, index) {
        return video.title || video.name || video.episode_title || (video.number ? 'Серия ' + video.number : 'Серия ' + (index + 1));
    }

    function videoDubbingTitle(video) {
        var data = video.data || {};
        var dubbing = labelFromValue(data.dubbing || video.dubbing || video.translation || video.voice);
        var player = labelFromValue(data.player || video.player_title || video.player_name);

        if (dubbing && player && dubbing !== player) return dubbing + ' / ' + player;
        return dubbing || player || 'Без озвучки';
    }

    function groupVideosByDubbing(videos) {
        var map = {};
        var groups = [];

        videos.forEach(function (video) {
            var title = videoDubbingTitle(video);

            if (!map[title]) {
                map[title] = {
                    title: title,
                    items: []
                };

                groups.push(map[title]);
            }

            map[title].items.push(video);
        });

        groups.forEach(function (group) {
            group.items.sort(function (a, b) {
                return (parseFloat(a.index || a.number || 0) || 0) - (parseFloat(b.index || b.number || 0) || 0);
            });
        });

        groups.sort(function (a, b) {
            return b.items.length - a.items.length;
        });

        return groups;
    }

    function requestJson(network, url, success, error) {
        try {
            network.silent(url, success, error, false, {
                dataType: 'json',
                headers: requestHeaders()
            });
        } catch (e) {
            try {
                network.silent(url, success, error, false, requestHeaders());
            } catch (secondError) {
                error(secondError);
            }
        }
    }

    function playVideo(video, title) {
        var url = absoluteUrl(videoUrl(video));

        if (!url) {
            fail('У серии нет ссылки на видео');
            return;
        }

        log('Запуск: ' + title);
        log('URL запуска: ' + url);

        if (isIframeUrl(url)) {
            if (url.indexOf('kodikplayer.com') >= 0 && Lampa.Iframe && Lampa.Iframe.show) {
                log('Открываю Kodik через Lampa.Iframe');
                Lampa.Iframe.show({
                    url: url,
                    onBack: function () {
                        if (Lampa.Controller) Lampa.Controller.toggle('content');
                    }
                });
                return;
            }

            if (url.indexOf('iframeCVH') >= 0 && openCvhPlayer(url, title)) {
                return;
            }

            if (Lampa.Iframe && Lampa.Iframe.show) {
                log('Открываю iframe через Lampa.Iframe');
                Lampa.Iframe.show({
                    url: url,
                    onBack: function () {
                        if (Lampa.Controller) Lampa.Controller.toggle('content');
                    }
                });
                return;
            }

            if (window.open) {
                window.open(url, '_blank');
                return;
            }
        }

        if (Lampa.Player && Lampa.Player.play) {
            Lampa.Player.play({
                title: title,
                url: url,
                card: Lampa.Activity && Lampa.Activity.active ? Lampa.Activity.active().movie : false,
                quality: video.quality || video.translation || ''
            });
        } else {
            fail('Lampa.Player.play недоступен');
        }
    }

    function createItem(template, data) {
        var item;

        try {
            if (USE_LAMPA_TEMPLATES && !templatesUnavailable[template] && Lampa.Template && Lampa.Template.get) {
                item = Lampa.Template.get(template, data);
                if (item && item.on && item.length) return item;
            }
        } catch (e) {
            templatesUnavailable[template] = true;
            log('Шаблон ' + template + ' недоступен, использую встроенный элемент');
        }

        item = $('<div class="online selector">' +
            '<div class="online__body">' +
            '<div class="online__title"></div>' +
            '<div class="online__quality"></div>' +
            '</div>' +
            '</div>');

        item.find('.online__title').text(data.title || '');
        item.find('.online__quality').text((data.quality || '') + (data.info || ''));

        return item;
    }

    function YummyAnimeSource(component, object) {
        var network = new Lampa.Reguest();
        var current = object || {};
        var results = [];
        var groupedResults = [];
        var selectedGroup = null;
        var groupOffset = 0;
        var videosCache = [];
        var videoGroups = [];
        var selectedVideoGroup = null;
        var videoOffset = 0;
        var selectedAnime = null;

        function searchTitle() {
            var movie = current.movie || current;
            return movie.title || movie.name || movie.original_title || movie.original_name || '';
        }

        function renderGroupList(groups) {
            component.reset();

            if (!groups.length) {
                component.empty();
                return;
            }

            groups.forEach(function (group) {
                var item = createItem('online_folder', {
                    title: group.title,
                    info: ' / ' + group.items.length + ' релизов',
                    quality: 'Озвучка'
                });

                item.on('hover:enter', function () {
                    selectedGroup = group;
                    selectedAnime = null;
                    groupOffset = 0;
                    renderAnimeList(group.items, group.title);
                });

                component.append(item);
            });

            component.start(true);
        }

        function renderAnimeList(items, groupTitle) {
            var visible = items.slice(0, groupOffset + PAGE_SIZE);

            component.reset();

            if (groupTitle) {
                var back = createItem('online_folder', {
                    title: 'К озвучкам',
                    info: ' / ' + groupTitle,
                    quality: SOURCE_TITLE
                });

                back.on('hover:enter', function () {
                    selectedGroup = null;
                    selectedAnime = null;
                    groupOffset = 0;
                    renderGroupList(groupedResults);
                });

                component.append(back);
            }

            if (!items.length) {
                component.empty();
                return;
            }

            visible.forEach(function (anime) {
                var title = itemTitle(anime);
                var year = parseInt(anime.year, 10) || '';
                var item = createItem('online', {
                    title: title,
                    info: (year ? ' / ' + year : '') + ' / ' + dubbingTitle(anime),
                    quality: SOURCE_TITLE
                });

                item.on('hover:enter', function () {
                    selectedAnime = anime;
                    loadVideos(itemId(anime), title);
                });

                component.append(item);
            });

            if (visible.length < items.length) {
                var more = createItem('online_folder', {
                    title: 'Показать еще',
                    info: ' / ' + visible.length + ' из ' + items.length,
                    quality: SOURCE_TITLE
                });

                more.on('hover:enter', function () {
                    groupOffset += PAGE_SIZE;
                    renderAnimeList(items, groupTitle);
                });

                component.append(more);
            }

            component.start(true);
        }

        function renderVideoGroupList(groups, animeTitle) {
            component.reset();

            if (!groups.length) {
                component.empty();
                fail('Серии не найдены для ' + animeTitle);
                return;
            }

            groups.forEach(function (group) {
                var item = createItem('online_folder', {
                    title: group.title,
                    info: ' / ' + group.items.length + ' серий',
                    quality: 'Озвучка'
                });

                item.on('hover:enter', function () {
                    selectedVideoGroup = group;
                    videoOffset = 0;
                    renderVideos(group.items, animeTitle, group.title);
                });

                component.append(item);
            });

            component.start(true);
        }

        function renderVideos(videos, animeTitle, groupTitle) {
            var visible = videos.slice(0, videoOffset + VIDEO_PAGE_SIZE);

            component.reset();
            videosCache = videos;

            if (groupTitle) {
                var back = createItem('online_folder', {
                    title: 'К озвучкам',
                    info: '',
                    quality: SOURCE_TITLE
                });

                back.on('hover:enter', function () {
                    selectedVideoGroup = null;
                    videoOffset = 0;
                    renderVideoGroupList(videoGroups, animeTitle);
                });

                component.append(back);
            }

            if (!videos.length) {
                component.empty();
                fail('Серии не найдены для ' + animeTitle);
                return;
            }

            visible.forEach(function (video, index) {
                var title = videoTitle(video, index + videoOffset);
                var item = createItem('online', {
                    title: title,
                    info: ' / ' + (video.index || video.video_id || '') + ' / ' + animeTitle,
                    quality: videoDubbingTitle(video)
                });

                item.addClass('video--stream');

                item.on('hover:enter', function () {
                    playVideo(video, animeTitle + ' - ' + title);
                });

                component.append(item);
            });

            if (visible.length < videos.length) {
                var more = createItem('online_folder', {
                    title: 'Показать еще',
                    info: ' / ' + visible.length + ' из ' + videos.length,
                    quality: SOURCE_TITLE
                });

                more.on('hover:enter', function () {
                    videoOffset += VIDEO_PAGE_SIZE;
                    renderVideos(videos, animeTitle, groupTitle);
                });

                component.append(more);
            }

            component.start(true);
        }

        function loadVideos(id, animeTitle) {
            if (!id) {
                fail('У найденного аниме нет id');
                return;
            }

            component.loading(true);
            log('Загрузка серий: ' + animeTitle);

            requestJson(
                network,
                'https://api.yani.tv/anime/' + encodeURIComponent(id) + '/videos',
                function (data) {
                    component.loading(false);
                    try {
                        videosCache = asArray(data);
                        videoGroups = groupVideosByDubbing(videosCache);
                        selectedVideoGroup = null;
                        videoOffset = 0;
                        log('Серий: ' + videosCache.length + ', групп озвучки: ' + videoGroups.length);
                        renderVideoGroupList(videoGroups, animeTitle);
                    } catch (e) {
                        fail('Ошибка отрисовки серий', e);
                        component.empty();
                    }
                },
                function (error) {
                    component.loading(false);
                    fail('Ошибка загрузки серий', error);
                    component.empty();
                }
            );
        }

        this.search = function (searchObject) {
            current = searchObject || current || {};
            selectedAnime = null;

            var query = searchTitle();

            if (!query || query.length < 2) {
                fail('Нет названия для поиска');
                component.empty();
                return;
            }

            component.loading(true);
            log('Поиск: ' + query);

            requestJson(
                network,
                'https://api.yani.tv/search?q=' + encodeURIComponent(query) + '&limit=' + LIMIT + '&offset=0',
                function (data) {
                    component.loading(false);
                    results = asArray(data).filter(function (item) {
                        return !!itemId(item);
                    });
                    groupedResults = [];
                    log('Найдено: ' + results.length);

                    try {
                        renderAnimeList(results);
                    } catch (e) {
                        fail('Ошибка отрисовки результатов', e);
                        component.empty();
                    }
                },
                function (error) {
                    component.loading(false);
                    fail('Ошибка поиска', error);
                    component.empty();
                }
            );
        };

        this.reset = function () {
            if (selectedAnime) {
                if (selectedVideoGroup) renderVideos(selectedVideoGroup.items, itemTitle(selectedAnime), selectedVideoGroup.title);
                else renderVideoGroupList(videoGroups, itemTitle(selectedAnime));
            } else if (selectedGroup) {
                renderAnimeList(selectedGroup.items, selectedGroup.title);
            } else {
                renderGroupList(groupedResults);
            }
        };

        this.filter = function () {};

        this.destroy = function () {
            if (network && network.clear) network.clear();
            results = [];
            groupedResults = [];
            selectedGroup = null;
            videosCache = [];
            videoGroups = [];
            selectedVideoGroup = null;
            selectedAnime = null;
        };
    }

    function YummyAnimeComponent(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({mask: true, over: true});
        var files = new Lampa.Files(object);
        var last;
        var results = [];
        var groupedResults = [];
        var selectedGroup = null;
        var groupOffset = 0;
        var videosCache = [];
        var videoGroups = [];
        var selectedVideoGroup = null;
        var videoOffset = 0;
        var selectedAnime = null;
        var resized = false;
        var self = this;

        function movieTitle() {
            var movie = object.movie || object;
            return object.search || movie.title || movie.name || movie.original_title || movie.original_name || '';
        }

        function append(item) {
            item.on('hover:focus', function (event) {
                last = event.target;
                scroll.update($(event.target), true);
            });

            scroll.append(item);
        }

        function loading(status) {
            if (self.activity && self.activity.loader) self.activity.loader(status);

            if (!status && self.activity && self.activity.toggle) {
                self.activity.toggle();
            }
        }

        function reset() {
            scroll.render().find('.empty').remove();
            scroll.clear();
            if (scroll.reset) scroll.reset();
        }

        function empty(message) {
            var item = Lampa.Template && Lampa.Template.get ? Lampa.Template.get('list_empty') : $('<div class="empty selector"><div class="empty__descr"></div></div>');

            if (message) item.find('.empty__descr').text(message);

            scroll.append(item);
            loading(false);
        }

        function start(first) {
            if (Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active().activity !== self.activity) return;

            if (first) last = scroll.render().find('.selector').eq(0)[0] || false;

            if (Lampa.Background && Lampa.Utils && object.movie) {
                Lampa.Background.immediately(Lampa.Utils.cardImgBackground(object.movie));
            }

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render(true), files.render(true));
                    Lampa.Controller.collectionFocus(last || false, scroll.render(true));
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    Navigator.move('down');
                },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else if (files.toggle) files.toggle();
                    else Lampa.Controller.toggle('menu');
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
        }

        function updateScrollHeight() {
            if (!scroll.minus) return;
            scroll.minus(window.innerWidth > 580 ? false : files.render().find('.files__left'));
        }

        function renderGroupList(groups) {
            reset();

            if (!groups.length) {
                empty('По запросу (' + movieTitle() + ') нет результатов');
                return;
            }

            groups.forEach(function (group) {
                var item = createItem('online_folder', {
                    title: group.title,
                    info: ' / ' + group.items.length + ' релизов',
                    quality: 'Озвучка'
                });

                item.on('hover:enter', function () {
                    selectedGroup = group;
                    selectedAnime = null;
                    groupOffset = 0;
                    renderAnimeList(group.items, group.title);
                });

                append(item);
            });

            loading(false);
            start(true);
        }

        function renderAnimeList(items, groupTitle) {
            var visible = items.slice(0, groupOffset + PAGE_SIZE);

            reset();

            if (groupTitle) {
                var back = createItem('online_folder', {
                    title: 'К озвучкам',
                    info: '',
                    quality: SOURCE_TITLE
                });

                back.on('hover:enter', function () {
                    selectedGroup = null;
                    selectedAnime = null;
                    groupOffset = 0;
                    renderGroupList(groupedResults);
                });

                append(back);
            }

            if (!items.length) {
                empty('По запросу (' + movieTitle() + ') нет результатов');
                return;
            }

            visible.forEach(function (anime) {
                var title = itemTitle(anime);
                var year = parseInt(anime.year, 10) || '';
                var item = createItem('online_folder', {
                    title: title,
                    info: (year ? ' / ' + year : '') + ' / ' + dubbingTitle(anime),
                    quality: SOURCE_TITLE
                });

                item.on('hover:enter', function () {
                    selectedAnime = anime;
                    loadVideos(itemId(anime), title);
                });

                append(item);
            });

            if (visible.length < items.length) {
                var more = createItem('online_folder', {
                    title: 'Показать еще',
                    info: ' / ' + visible.length + ' из ' + items.length,
                    quality: SOURCE_TITLE
                });

                more.on('hover:enter', function () {
                    groupOffset += PAGE_SIZE;
                    renderAnimeList(items, groupTitle);
                });

                append(more);
            }

            loading(false);
            start(true);
        }

        function renderVideoGroupList(groups, animeTitle) {
            reset();

            if (!groups.length) {
                empty('Серии не найдены для ' + animeTitle);
                return;
            }

            groups.forEach(function (group) {
                var item = createItem('online_folder', {
                    title: group.title,
                    info: ' / ' + group.items.length + ' серий',
                    quality: 'Озвучка'
                });

                item.on('hover:enter', function () {
                    selectedVideoGroup = group;
                    videoOffset = 0;
                    renderVideos(group.items, animeTitle, group.title);
                });

                append(item);
            });

            loading(false);
            start(true);
        }

        function renderVideos(videos, animeTitle, groupTitle) {
            var visible = videos.slice(0, videoOffset + VIDEO_PAGE_SIZE);

            reset();
            videosCache = videos;

            if (groupTitle) {
                var back = createItem('online_folder', {
                    title: 'К озвучкам',
                    info: '',
                    quality: SOURCE_TITLE
                });

                back.on('hover:enter', function () {
                    selectedVideoGroup = null;
                    videoOffset = 0;
                    renderVideoGroupList(videoGroups, animeTitle);
                });

                append(back);
            }

            if (!videos.length) {
                empty('Серии не найдены для ' + animeTitle);
                return;
            }

            visible.forEach(function (video, index) {
                var title = videoTitle(video, index + videoOffset);
                var item = createItem('online', {
                    title: title,
                    info: ' / ' + animeTitle,
                    quality: videoDubbingTitle(video)
                });

                item.addClass('video--stream');

                item.on('hover:enter', function () {
                    playVideo(video, animeTitle + ' - ' + title);
                });

                append(item);
            });

            if (visible.length < videos.length) {
                var more = createItem('online_folder', {
                    title: 'Показать еще',
                    info: ' / ' + visible.length + ' из ' + videos.length,
                    quality: SOURCE_TITLE
                });

                more.on('hover:enter', function () {
                    videoOffset += VIDEO_PAGE_SIZE;
                    renderVideos(videos, animeTitle, groupTitle);
                });

                append(more);
            }

            loading(false);
            start(true);
        }

        function loadVideos(id, animeTitle) {
            if (!id) {
                empty('У найденного аниме нет id');
                fail('У найденного аниме нет id');
                return;
            }

            loading(true);
            log('Загрузка серий: ' + animeTitle);

            requestJson(
                network,
                'https://api.yani.tv/anime/' + encodeURIComponent(id) + '/videos',
                function (data) {
                    try {
                        videosCache = asArray(data);
                        videoGroups = groupVideosByDubbing(videosCache);
                        selectedVideoGroup = null;
                        videoOffset = 0;
                        log('Серий: ' + videosCache.length + ', групп озвучки: ' + videoGroups.length);
                        renderVideoGroupList(videoGroups, animeTitle);
                    } catch (e) {
                        fail('Ошибка отрисовки серий', e);
                        empty('Ошибка отрисовки серий');
                    }
                },
                function (error) {
                    fail('Ошибка загрузки серий', error);
                    empty('Ошибка загрузки серий');
                }
            );
        }

        this.create = function () {
            loading(true);

            scroll.body().addClass('torrent-list');
            updateScrollHeight();
            window.addEventListener('resize', updateScrollHeight, false);
            resized = true;
            files.append(scroll.render());

            this.search();

            return this.render();
        };

        this.search = function () {
            var query = movieTitle();

            if (!query || query.length < 2) {
                empty('Нет названия для поиска');
                return;
            }

            loading(true);
            log('Поиск: ' + query);

            requestJson(
                network,
                'https://api.yani.tv/search?q=' + encodeURIComponent(query) + '&limit=' + LIMIT + '&offset=0',
                function (data) {
                    results = asArray(data).filter(function (item) {
                        return !!itemId(item);
                    });
                    groupedResults = [];

                    log('Найдено: ' + results.length);

                    try {
                        renderAnimeList(results);
                    } catch (e) {
                        fail('Ошибка отрисовки результатов', e);
                        empty('Ошибка отрисовки результатов');
                    }
                },
                function (error) {
                    fail('Ошибка поиска', error);
                    empty('Ошибка поиска');
                }
            );
        };

        this.start = start;

        this.render = function () {
            return files.render();
        };

        this.back = function () {
            Lampa.Activity.backward();
        };

        this.pause = function () {};

        this.stop = function () {};

        this.destroy = function () {
            if (resized) window.removeEventListener('resize', updateScrollHeight, false);
            if (network && network.clear) network.clear();
            if (files && files.destroy) files.destroy();
            if (scroll && scroll.destroy) scroll.destroy();

            results = [];
            groupedResults = [];
            selectedGroup = null;
            videosCache = [];
            videoGroups = [];
            selectedVideoGroup = null;
            selectedAnime = null;
            network = null;
        };
    }

    function addFullButton() {
        if (!Lampa.Listener || !window.$) return;

        Lampa.Listener.follow('full', function (event) {
            if (event.type !== 'complite' || !event.object || !event.object.activity) return;

            var render = event.object.activity.render();
            var exists = render.find('.view--' + SOURCE_NAME);

            if (exists.length) return;

            var button = $('<div class="full-start__button selector view--' + SOURCE_NAME + '" data-subtitle="anime">' +
                '<svg width="512" height="512" viewBox="0 0 30.051 30.051" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M19.982 14.438l-6.24-4.536c-.229-.166-.533-.191-.784-.062-.253.128-.411.388-.411.669v9.069c0 .284.158.543.411.671.107.054.224.081.342.081.154 0 .31-.049.442-.146l6.24-4.532c.197-.145.312-.369.312-.607 0-.242-.118-.465-.312-.607z" fill="currentColor"/>' +
                '<path d="M15.026.002C6.726.002 0 6.728 0 15.028c0 8.297 6.726 15.021 15.026 15.021 8.298 0 15.025-6.725 15.025-15.021C30.052 6.728 23.324.002 15.026.002zm0 27.54c-6.912 0-12.516-5.601-12.516-12.514 0-6.91 5.604-12.518 12.516-12.518 6.911 0 12.514 5.607 12.514 12.518 0 6.913-5.604 12.514-12.514 12.514z" fill="currentColor"/>' +
                '</svg><span>' + SOURCE_TITLE + '</span></div>');

            button.on('hover:enter', function () {
                Lampa.Activity.push({
                    url: '',
                    title: SOURCE_TITLE,
                    component: SOURCE_NAME,
                    search: event.data.movie.title || event.data.movie.name,
                    search_one: event.data.movie.title || event.data.movie.name,
                    search_two: event.data.movie.original_title || event.data.movie.original_name,
                    movie: event.data.movie,
                    page: 1
                });
            });

            var torrent = render.find('.view--torrent');
            if (torrent.length) torrent.after(button);
            else render.find('.full-start__button').last().after(button);
        });
    }

    function addSettings() {
        if (!Lampa.SettingsApi || !Lampa.SettingsApi.addParam) return;

        Lampa.SettingsApi.addParam({
            component: 'sources',
            param: {
                name: SOURCE_NAME,
                title: SOURCE_TITLE,
                type: 'switch',
                'default': true,
                description: 'Аниме с yummyanime.tv'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'sources',
            param: {
                name: SOURCE_NAME + '_debug',
                title: SOURCE_TITLE + ': диагностика',
                type: 'switch',
                'default': DEBUG,
                description: 'Показывать важные сообщения плагина'
            },
            onChange: function (value) {
                DEBUG = value;
            }
        });
    }

    function startPlugin() {
        if (!window.Lampa) {
            fail('Lampa недоступна при старте');
            return;
        }

        if (window[SOURCE_NAME + '_plugin_loaded']) {
            log('Плагин уже загружен');
            return;
        }

        window[SOURCE_NAME + '_plugin_loaded'] = true;

        if (Lampa.Source && Lampa.Source.add) {
            Lampa.Source.add(SOURCE_NAME, YummyAnimeSource);
            log('Источник зарегистрирован через Lampa.Source');
        } else if (Lampa.Component && Lampa.Component.add) {
            Lampa.Component.add(SOURCE_NAME, YummyAnimeComponent);
            addFullButton();
            log('Компонент зарегистрирован через Lampa.Component');
        } else {
            window[SOURCE_NAME + '_plugin_loaded'] = false;
            fail('Нет подходящего API: ни Lampa.Source.add, ни Lampa.Component.add');
            return;
        }

        addSettings();

        log('Плагин зарегистрирован', true);
    }

    function waitLampa() {
        initTries += 1;

        if (window.Lampa && Lampa.Listener) {
            clearInterval(initTimer);

            if (window.appready) {
                startPlugin();
            } else {
                Lampa.Listener.follow('app', function (event) {
                    if (event.type === 'ready') startPlugin();
                });
            }

            return;
        }

        if (initTries >= 100) {
            clearInterval(initTimer);
            fail('Lampa не появилась за 10 секунд');
        }
    }

    log('Файл плагина выполнен, версия ' + VERSION);
    initTimer = setInterval(waitLampa, 100);
    waitLampa();
})();
