# YummyAnime для Media Station X

`ym` теперь можно запускать как единое Node.js-приложение:
- сервер отдает `app.html`, `start.json`, `menu.json`, `launch.json`
- API-ендпоинт `/api/resolve` пытается превратить iframe URL в прямой `m3u8/mp4`

## Запуск

```bash
cd ym
npm install
npm start
```

По умолчанию сервер слушает `http://127.0.0.1:8787`.

Если нужен токен из окружения:

```bash
YAMMY_TOKEN=token npm start
```

## Что отдает сервер

- `/app.html`
- `/start.json`
- `/menu.json`
- `/launch.json`
- `/api/health`
- `/api/resolve?url=...`

`app.html`, `start.json`, `menu.json`, `launch.json` и `index.js` рендерятся на лету:
- `{BASE}` заменяется на текущий origin запроса
- `{YUMMY_TOKEN}` заменяется на `YAMMY_TOKEN` или `YUMMY_TOKEN` из окружения

## Cloudflare Worker

Есть отдельный [worker.js](air-file://fd7mj2ujdf4d3b9eevs6/Users/val/p/tmp/msx/ym/worker.js?type=file&root=%252F), который повторяет маршруты сервера:
- `/api/health`
- `/api/resolve`
- отдача статики через binding `ASSETS`

Что важно для Worker:
- binding `ASSETS` обязателен, иначе статика не отдается
- `{BASE}` и `{YUMMY_TOKEN}` подставляются на лету только в `.html` и `.json`
- `Kodik` резолвится полноценно через `/ftor`
- `Aksor` и `Alloha` в Worker-режиме без headless browser поддерживаются только если прямой media URL уже виден в HTML

## Резолверы

Поддержаны провайдеры:
- `kodik`
- `aksor`
- `alloha`

Стратегия резолва:
- сначала легкий HTTP-парсинг страницы
- потом fallback через headless browser

Это особенно важно для `Kodik`: embed-страница отдает подписанную конфигурацию и JS-плеер, а не прямой media URL.

## Зависимости

Для headless fallback нужен `playwright`. Он добавлен как `optionalDependency`, но для реального резолва его нужно установить.

## Ограничения

- ссылки у провайдеров обычно короткоживущие, поэтому резолв должен происходить прямо перед воспроизведением
- если прямую ссылку получить не удалось, `app.html` откатывается обратно к iframe
- DRM-кейсы и агрессивные антибот-проверки могут остаться нерешенными даже с headless fallback
