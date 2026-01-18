# Discord Clone - Electron App

Electron-приложение для общения с функциями голосовых звонков, видеозвонков, демонстрации экрана и текстовых чатов.

## Возможности

- 🎤 Голосовые звонки 1-на-1
- 📹 Видеозвонки
- 🖥️ Демонстрация экрана (несколько одновременно)
- 💬 Текстовые чаты в реальном времени
- 👥 Система друзей
- 🌐 Серверы с каналами
- 🔔 Уведомления
- 📊 Индикатор качества связи
- 🎨 Настройка аватара

## Установка

### 1. Клонировать репозиторий

```bash
git clone https://github.com/твой-username/discord-clone.git
cd discord-clone
```

### 2. Установить зависимости

```bash
npm install
```

### 3. Настроить Firebase

1. Создай проект на [Firebase Console](https://console.firebase.google.com/)
2. Включи следующие сервисы:
   - **Authentication** (Email/Password)
   - **Firestore Database**
   - **Realtime Database**
   - **Storage**
3. Скопируй конфигурацию Firebase:

```bash
cp src/renderer/firebase.example.js src/renderer/firebase.js
```

4. Открой `src/renderer/firebase.js` и замени значения на свои из Firebase Console

### 4. Настроить Firestore правила безопасности

В Firebase Console → Firestore Database → Rules, добавь:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }
    
    match /friends/{friendId} {
      allow read, write: if request.auth != null;
    }
    
    match /friendRequests/{requestId} {
      allow read, write: if request.auth != null;
    }
    
    match /directMessages/{messageId} {
      allow read, write: if request.auth != null;
    }
    
    match /servers/{serverId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    match /calls/{callId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 5. Настроить Realtime Database правила

В Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "presence": {
      "$uid": {
        ".read": true,
        ".write": "$uid === auth.uid"
      }
    },
    "activeCalls": {
      "$uid": {
        ".read": true,
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```

### 6. Настроить Storage правила

В Firebase Console → Storage → Rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /avatars/{userId}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }
  }
}
```

## 📥 Установка для пользователей

### Простая установка (1 клик)

1. Перейди на страницу [**Releases**](https://github.com/xktyprod/dickord/releases)
2. Скачай установщик для своей системы:
   - **Windows**: `Dickord-Setup-1.0.0.exe` ⬅️ Просто запусти!
   - **macOS**: `Dickord-1.0.0.dmg`
   - **Linux**: `Dickord-1.0.0.AppImage`
3. Запусти файл - приложение установится автоматически

> **Примечание**: Если релизов еще нет, они появятся после первой публикации.

---

## 🛠️ Для разработчиков

### Режим разработки

```bash
npm run dev
```

### Сборка установщика

```bash
npm run build
```

Установщик будет создан в папке `dist-build/`

## Технологии

- **Electron** - Desktop framework
- **React** - UI library
- **Vite** - Build tool
- **Firebase** - Backend (Auth, Firestore, Realtime DB, Storage)
- **WebRTC** - Нативная технология для голосовых/видео звонков и демонстрации экрана

## Структура проекта

```
discord-clone/
├── src/
│   ├── main/           # Electron main process
│   └── renderer/       # React app
│       ├── components/ # React компоненты
│       ├── services/   # Firebase и Agora сервисы
│       └── styles/     # CSS стили
├── public/             # Статические файлы
└── assets/             # Иконки приложения
```

## Лицензия

MIT

## Автор

Твое имя
