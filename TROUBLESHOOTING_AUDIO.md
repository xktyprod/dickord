# Диагностика проблем со звуком

## Проверка 1: Разрешения Electron (КРИТИЧНО!)

**Проблема**: В production билде Electron не запрашивает разрешения на микрофон автоматически.

**Решение**: Уже исправлено в `src/main/main.js` - добавлен `setPermissionRequestHandler`.

**Проверка**: 
1. Открой DevTools (F12) в собранном приложении
2. В консоли выполни: `navigator.mediaDevices.getUserMedia({audio: true})`
3. Если ошибка "Permission denied" - проблема с разрешениями

---

## Проверка 2: Системные разрешения Windows

**Проблема**: Windows блокирует доступ к микрофону для приложения.

**Решение**:
1. Открой Settings → Privacy → Microphone
2. Убедись что "Allow apps to access your microphone" включено
3. Найди Dickord в списке и включи доступ

---

## Проверка 3: Микрофон заглушен в приложении

**Проблема**: Кнопка "Заглушить микрофон" нажата.

**Решение**: Проверь иконку микрофона в интерфейсе - она не должна быть перечеркнута.

---

## Проверка 4: Порог чувствительности микрофона

**Проблема**: Noise gate (порог) установлен слишком высоко.

**Решение**:
1. Открой Settings → Audio
2. Установи "Mic Threshold" на 0%
3. Попробуй снова

---

## Проверка 5: WebRTC соединение не установлено

**Проблема**: P2P соединение между пользователями не работает.

**Проверка в DevTools**:
```javascript
// В консоли обоих пользователей
console.log('Connection state:', window.webrtcDebug)
```

**Возможные причины**:
- Файрвол блокирует UDP порты
- TURN серверы не работают
- NAT traversal не удался

**Решение**:
1. Проверь что оба пользователя в звонке
2. Проверь консоль на ошибки WebRTC
3. Попробуй отключить файрвол временно

---

## Проверка 6: AudioContext suspended

**Проблема**: Браузер требует user gesture для запуска аудио.

**Проверка**: В консоли DevTools:
```javascript
// Проверь состояние AudioContext
console.log('AudioContext state:', window.audioContextState)
```

**Решение**: Уже обработано в коде - AudioContext.resume() вызывается автоматически.

---

## Проверка 7: Треки не добавлены в PeerConnection

**Проблема**: Локальный аудио трек не отправляется другому пользователю.

**Проверка в DevTools**:
```javascript
// Проверь локальный стрим
navigator.mediaDevices.getUserMedia({audio: true}).then(stream => {
  console.log('Local tracks:', stream.getTracks());
  console.log('Track enabled:', stream.getAudioTracks()[0].enabled);
  console.log('Track muted:', stream.getAudioTracks()[0].muted);
});
```

---

## Проверка 8: Громкость установлена на 0

**Проблема**: Глобальная громкость или громкость пользователя = 0.

**Решение**:
1. Проверь настройки Output Volume
2. Проверь громкость конкретного пользователя (ПКМ → Volume)

---

## Проверка 9: Неправильное устройство вывода

**Проблема**: Звук идет на неправильное устройство (наушники вместо динамиков).

**Решение**:
1. Settings → Audio → Output Device
2. Выбери правильное устройство

---

## Проверка 10: Firestore правила блокируют сигналинг

**Проблема**: Сообщения WebRTC не доходят через Firebase.

**Проверка**: В Firebase Console → Firestore → Data, проверь коллекцию `voiceSignaling`.

**Решение**: Убедись что правила Firestore разрешают чтение/запись.

---

## Быстрая диагностика (для пользователя)

Попроси друга выполнить:

1. **Нажми F12** в приложении
2. **Перейди в Console**
3. **Выполни**:
```javascript
navigator.mediaDevices.getUserMedia({audio: true})
  .then(stream => {
    console.log('✅ Микрофон работает!');
    console.log('Треки:', stream.getTracks());
    stream.getTracks().forEach(t => t.stop());
  })
  .catch(err => {
    console.error('❌ Ошибка микрофона:', err.message);
  });
```

4. **Отправь скриншот консоли**

---

## Логирование для отладки

Добавь в начало `webrtcService.js`:

```javascript
// Debug logging
window.webrtcDebug = {
  state: () => state,
  peers: () => Array.from(state.peers.entries()),
  localStream: () => state.localStream,
  checkAudio: async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      console.log('✅ Микрофон доступен');
      console.log('Треки:', stream.getTracks());
      stream.getTracks().forEach(t => t.stop());
      return true;
    } catch (err) {
      console.error('❌ Ошибка:', err);
      return false;
    }
  }
};
```

Затем в консоли: `webrtcDebug.checkAudio()`

---

## Самая частая проблема

**90% случаев**: Electron не запросил разрешение на микрофон в production билде.

**Решение**: Пересобрать с исправленным `main.js` (уже сделано).
