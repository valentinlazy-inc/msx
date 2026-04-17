# YummyAnime для Media Station X

Статическое HTML-приложение для Media Station X. Готовые файлы можно положить на любой static hosting, а само приложение ходит напрямую в YummyAnime API (`https://api.yani.tv`) из браузера.

## Сборка

```bash
BASE_URL=https://example.com/path YAMMY_TOKEN=token ./scripts/build-static.sh
```

То же самое аргументами:

```bash
./scripts/build-static.sh --base-url https://example.com/path --yammy-token token
```

По умолчанию результат кладется в `dist/`. Можно изменить папку:

```bash
OUT_DIR=public BASE_URL=https://example.com/path YAMMY_TOKEN=token ./scripts/build-static.sh
```

`YUMMY_TOKEN` тоже поддерживается как алиас для `YAMMY_TOKEN`.

## Публикация

Загрузите содержимое `dist/` в публичную директорию static hosting. В Media Station X используйте:

```text
https://example.com/path/start.json
```

Для браузерного теста:

```text
https://msx.benzac.de/?start=menu:https://example.com/path/menu.json
```

## Файлы

- `start.json` - шаблон MSX start object.
- `menu.json` - шаблон главного меню.
- `launch.json` - промежуточная страница с кнопкой запуска HTML-приложения.
- `app.html` - само приложение: каталог, поиск, фильтры, страница тайтла, озвучки, серии и iframe-плеер.
- `scripts/build-static.sh` - сборка статики с подстановкой `BASE_URL` и `YAMMY_TOKEN`.

## Что уже работает

- Прямые запросы из `app.html` в YummyAnime API через `X-Application`.
- Каталог, поиск и быстрые фильтры.
- Страница тайтла с постером, описанием и бейджем статуса.
- Группировка озвучек по плееру/дубляжу, диапазоны серий и сортировка по максимальной серии.
- Просмотр iframe-плееров с автозапуском, где его поддерживает конкретный плеер.
- SPA-навигация через `history.back()` для пульта.
