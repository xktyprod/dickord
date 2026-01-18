# Инструкция по созданию релиза

## Автоматическая сборка (рекомендуется)

Теперь релизы создаются автоматически! Просто создай тег:

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions автоматически:
1. Соберет установщики для Windows, macOS и Linux
2. Создаст релиз на GitHub
3. Загрузит все установщики

Пользователи смогут скачать готовые установщики с https://github.com/xktyprod/dickord/releases

## Ручная сборка (если нужно)

Если хочешь собрать локально:

```bash
npm run build
```

Установщик будет в папке `dist-build/`

## Что видят пользователи

1. Заходят на https://github.com/xktyprod/dickord/releases
2. Видят последний релиз с файлами:
   - `Dickord-Setup-1.0.0.exe` (Windows)
   - `Dickord-1.0.0.dmg` (macOS)
   - `Dickord-1.0.0.AppImage` (Linux)
3. Скачивают нужный файл
4. Запускают - приложение устанавливается автоматически!

## Создание первого релиза

```bash
# Закоммить изменения
git add .
git commit -m "Add automated release workflow"
git push

# Создать тег и запустить сборку
git tag v1.0.0
git push origin v1.0.0
```

Через несколько минут релиз появится на GitHub!
