# Art of Victory (AOV) — обзор проекта

Веб-пошаговая тактическая игра: клиент **SPA** на **React + TypeScript** (**Vite**), сервер **Node.js (Express)**, данные в **PostgreSQL**. Игровая логика боя выполняется на сервере; клиент отвечает за интерфейс, отрисовку гексагональной карты (**Canvas 2D**) и вызовы **REST API**.

---

## Структура репозитория (каталог `aov/`)

| Путь | Назначение |
|------|------------|
| `package.json` | Скрипты фронтенда (`dev`, `build`, `lint`), зависимости React/Vite/TS. |
| `vite.config.ts` | Корень Vite — папка `client/`, прокси `/api` и `/uploads` на `127.0.0.1:5000`, сборка в `dist/`. |
| `client/` | Исходники SPA: `index.html`, `src/`, стили, изображения. |
| `client/index.html` | Точка входа HTML, подключение `main.tsx`. |
| `client/src/` | Компоненты страниц, API-клиент, игровые хелперы клиента. |
| `dist/` | Сборка фронтенда для продакшена (после `npm run build` из корня `aov/`). |
| `server/` | Backend Express, игровой движок `game/`, маршруты `routes/`. |
| `server/server.js` | Запуск HTTP-сервера и монтирование роутов. |
| `server/.env` | Локальные секреты (не коммитить). Шаблон — `.env.example`. |

Зависимости **`node_modules`** в документ не входят: это сторонние библиотеки из npm.

---

## Запуск разработки

1. **PostgreSQL** — созданная БД и пользователь (см. переменные в `server/.env`). При ошибках сохранения про отсутствующие колонки выполните при необходимости SQL из `server/migrations/` (например `add_unit_explosives_smoke_shells.sql`, `add_hex_extra_fire_row_options.sql`).
2. **Сервер** (из папки `server/`):

   ```bash
   cd server
   npm install
   npm run dev
   ```

   По умолчанию слушает порт из `PORT` или **5000**.

3. **Клиент** (из корня **`aov/`**, не из `client/`):

   ```bash
   npm install
   npm run dev
   ```

   Vite поднимает dev-сервер (порт **5173** в конфиге), запросы `/api` проксируются на backend.

Продакшен-сборка фронта: из корня `aov/` выполнить `npm run build` → артефакты в **`dist/`**. Статику раздаёт Nginx или аналог; API проксируется на процесс Node.

Переменные окружения клиента для продакшена задаются через файлы в **`aov/`** (`envDir` в Vite), например **`VITE_API_ORIGIN`** — базовый URL API, если фронт и API на разных доменах.

---

## Переменные окружения сервера

Подробный пример — **`server/.env.example`**. Основные:

| Переменная | Роль |
|------------|------|
| `PORT` | Порт HTTP API. |
| `CLIENT_ORIGIN` / `CLIENT_ORIGINS` | Разрешённые Origin для CORS (можно список через запятую). |
| `DB_*` | Подключение PostgreSQL. |
| `JWT_SECRET` | Подпись JWT. |
| `JWT_COOKIE_NAME` | Имя httpOnly-cookie с токеном. |
| `COOKIE_SECURE` | Отправка cookie только по HTTPS в проде. |
| `NODE_ENV` | Режим (`production` / иное). |
| `BATTLE_PRESENCE_TIMEOUT_MS` | Таймаут присутствия в бою (опционально, см. `routes/rooms/shared.js`). |

---

## Архитектура взаимодействия

```
Браузер (SPA)  ──HTTP REST──►  Express (server.js)
                                    │
                                    ├──► PostgreSQL (users, maps, catalog…)
                                    └──► In-memory: комнаты боя (routes/rooms/state.js)
```

Черновики приказов и состояние активного боя для комнаты хранятся **в памяти процесса Node** (структура `rooms`). Каталог юнитов/гексов и сохранённые карты — в **БД**.

---

## Сервер: точка входа и инфраструктура

### Корень `server/`

| Файл | Описание |
|------|----------|
| `server.js` | Express-приложение: **cors**, **cookie-parser**, **express.json** (лимит тела), статика **`/uploads`**, префиксы **`/api/auth`**, **`/api/editor`**, **`/api/rooms`**, **`/api/maps`**. |
| `db.js` | Пул **`pg`**, функции **`register`**, **`login`**, **`verifyToken`**; хэш пароля **bcrypt**, токен **JWT**. |
| `cookieAuth.js` | Опции cookie (**httpOnly**, **sameSite**, **secure**), **`setAuthCookie`**, **`clearAuthCookie`**, **`getTokenFromRequest`** (cookie или заголовок). |
| `mapsPolicy.js` | **`isMapAdminUser`** — проверка прав модерации карт по имени пользователя. |
| `catalogEditorAdminMiddleware.js` | Middleware **`requireCatalogEditorAdmin`** для защиты редактора каталога. |

---

## Сервер: маршруты `server/routes/`

### Auth — `routes/auth/`

| Файл | Описание |
|------|----------|
| `router.js` | Маршруты: **`POST /register`**, **`POST /login`**, **`POST /logout`**, **`GET /verify`**. |
| `handlers.js` | Валидация полей регистрации/входа, вызов `db.js`, установка cookie при успехе. |

### Комнаты и бой — `routes/rooms/`

| Файл | Описание |
|------|----------|
| `rooms.js` | Реэкспорт **`router.js`** (удобная точка импорта из `server.js`). |
| `router.js` | Регистрирует **`lobbyRoutes`** и **`battleRoutes`**. |
| `state.js` | **`rooms`** — `Map` комнат в памяти. |
| `shared.js` | Сборка **`roomDetailPayload`** (игроки, бой, `battleTurnIndex`, лог, клетки), разрешение подписей игроков из БД, хелперы фракций, **`battleMembersNeedingTurnAck`**, присутствие в бою, форматирование строк приказов для лога. |
| `lobbyRoutes.js` | Создание комнаты, присоединение, фракции, старт боя, загрузка **payload** карты из БД, обогащение юнитов (`battleEnrich`). |
| `battleRoutes.js` | **`POST …/battle/orders`** — сохранение черновика приказов при текущем `battleTurnIndex`; **`POST …/battle/turn-ready`** — барьер «все готовы» → **`buildMergedOrders`** + **`resolveTurn`**; **`POST …/battle/surrender`**. |
| `validation.js` | **`validateSubmittedOrders`** — обёртка над **`validateBattleOrders`** с проверкой «свой юнит» и нормализацией ключей приказов. |

### Редактор каталога — `routes/editor/`

| Файл | Описание |
|------|----------|
| `router.js` | Сборка подроутеров meta/units/hexes/buildings/rules. |
| `meta.js` | Каталог объектов и сводные данные для редактора. |
| `units.js` | CRUD юнитов и связей с заказами/свойствами/уроном. |
| `hexes.js` | CRUD типов гексов. |
| `buildings.js` | CRUD записей зданий (`build`). |
| `rules.js` | CRUD правил (`rule`). |
| `shared.js` | Общие операции удаления/вставки связей юнита с заказами и свойствами. |

Файл **`routes/editor.js`** в корне `routes/` реэкспортирует **`editor/router.js`**.

### Загрузки редактора — `routes/editorUpload/`

| Файл | Описание |
|------|----------|
| `router.js` | Подключение хендлеров загрузки. |
| `handlers.js` | **Multer**: сохранение изображений в **`uploads/editor`** с ограничением типа и размера. |

### Карты — `routes/maps/`

| Файл | Описание |
|------|----------|
| `router.js` | CRUD/листинг сохранённых карт, модерация для админа. |
| `handlers.js` | Запросы к таблице **`saved_map`**, проверка владельца и **`isMapAdminUser`** для модерации. |
| `shared.js` | Общие утилиты maps API (токен, пользователь). |

---

## Сервер: игровой движок `server/game/`

Центральный модуль — **`battleEngine.js`**: экспорт **`resolveTurn`** и множества функций, используемых фазами и валидацией (геометрия, типы юнитов, огонь и т.д.).

### Ядро — `game/core/`

| Файл | Описание |
|------|----------|
| `battleEngineHelpers.js` | В том числе **`isMoveOrderValid`** и зависимости для проверки перемещений. |
| `battleOverwatchCore.js` | Навесной огонь, стойкость, подавление после урона. |
| `battleMorale.js` | Броски морали, подавление, восстановление. |
| `battleAmbush.js` | Логика засады. |
| `battleTransport.js` | **`carriedUnits`**, грузовики, ограничения по численности при перевозке. |
| `battleUnitType.js` | Классификация юнитов (пехота, артиллерия, техника и т.п.). |

### Фазы хода — `game/phases/`

| Файл | Описание |
|------|----------|
| `battleMovePhase.js` | Исполнение **`move` / `moveWar`**. |
| `battleMeleePhase.js` | Ближний бой. |
| `battleFirePhase.js` | Огонь и огонь на подавление; расход БК; вызов резолверов огня. |
| `battleDefendAmbushPhase.js` | Оборона и засада, сектора. |
| `battleSpecialPhase.js` | Развёртывание/свёртывание артиллерии, смена сектора, логистика, буксировка и др. |
| `battleOverwatchFire.js` | Отработка навесного огня после основных фаз. |

### Карта и перемещения — `game/lib/map/`

| Файл | Описание |
|------|----------|
| `battleHexGeometry.js` | Кубические координаты, соседи, **`hexDistCells`**. |
| `battleHexMovement.js` | **`findReachable`**, **`findPath`** (кратчайший путь по стоимости местности — логика уровня Дейкстры). |
| `battleTerrain.js` | **`terrainEntryCost`** для типов местности и класса юнита. |
| `battleFogVisibility.js` | ЛОС, множества видимых клеток, **`canSpotAmbushTarget`**. |
| `battleDefendSector.js` | Построение сектора обстрела **`computeDefendSectorIds`**, лимиты дальности. |

### Огонь — `game/lib/fire/`

| Файл | Описание |
|------|----------|
| `battleDirectFireResolver.js` | Прямой огонь по юниту. |
| `battleAreaFireResolver.js` | Огонь по площади / группам. |
| `battleAreaFireGrouping.js` | Группировка атакующих для площади. |
| `battleAreaFireAccumulator.js` | Накопление результатов по целям. |
| `battleFireNormalize.js` | Нормализация входных параметров огня. |
| `battleEnginePhase.js` | Номера фаз для лога, маппинг типа приказа → фаза. |
| `areaFire.js` | Вспомогательные функции площадного огня. |

### Юниты — `game/lib/unit/`

| Файл | Описание |
|------|----------|
| `battleUnitField.js` | Поиск юнита на поле, фракции, численность, противники. |
| `battleUnitVision.js` | **`readVisionRange`** (учёт подавления → дальность 1). |
| `battleUnitResources.js` | Боеприпасы и связанные проверки. |

### Сценарий и ход — `game/lib/scenario/`

| Файл | Описание |
|------|----------|
| `battleTurnResolution.js` | **`buildMergedOrders`**, **`buildTurnResolutionLog`**, вызов **`resolveTurn`**. |
| `battleScenarioResolution.js` | Итог сценария после хода (победа, конец миссии). |
| `battleMissionVictory.js` | Условия победы и лимиты ходов. |

### Поддержка и валидация — `game/lib/support/` и `game/validation/`

| Файл | Описание |
|------|----------|
| `lib/support/battleOrderValidation.js` | Полная серверная **`validateBattleOrders`** для черновика приказов. |
| `lib/support/battleEnrich.js` | **`enrichBattleCells`**, **`loadBattleCellsFromMapId`** — данные из БД для юнитов на карте. |
| `validation/battleArtilleryValidation.js` | Специализированные проверки артиллерии. |
| `validation/battleLogisticsValidation.js` | Проверки логистики и буксировки. |

---

## Сервер: TypeScript-слой `server/src/game/`

Используется в том числе клиентом через импорт типов **`Cell`** и логики видимости.

| Файл | Описание |
|------|----------|
| `gameLogic/cells/cell.ts` | Интерфейсы/класс клетки для типизации. |
| `gameLogic/visibleLogic.ts` | **`VisibleLogic`**, **`readVisionRange`** на TS-моделях (согласовано по смыслу с JS-слоем тумана). |

---

## Клиент: точка входа и приложение — `client/src/`

| Файл | Описание |
|------|----------|
| `main.tsx` | **`ReactDOM.createRoot`**, монтирование **`App`**. |
| `App.tsx` | **`BrowserRouter`**, **`AuthProvider`**, маршруты: **`/auth`**, **`/main`**, **`/lobby`**, **`/battle`**, **`/editor-map`**, **`/editor-unit`**, **`/manual`**; guards **`RequireAuth`**, **`RequireGuest`**, **`RequireCatalogEditorAdmin`**. |
| `context/AuthContext.tsx` | Пользователь, загрузка сессии (**`verifySession`**), **`setUser`**. |

---

## Клиент: API — `client/src/api/`

| Файл | Описание |
|------|----------|
| `auth.ts` | **`register`**, **`login`**, **`verifySession`**, **`logoutRequest`** — **`credentials: 'include'`** для cookie. |
| `rooms.ts` | Типы комнаты, опрос состояния, старт боя, отправка приказов, **`battle/turn-ready`**, лобби. |
| `maps.ts` | Список и деталь сохранённых карт, сохранение payload. |
| `editorCatalog.ts` | Загрузка каталога для редакторов. |

---

## Клиент: страницы — `client/src/pages/`

| Файл | Описание |
|------|----------|
| `Main.tsx` | Главная: список комнат / создание. |
| `Lobby.tsx` | Лобби перед боем. |
| `Battle.tsx` | Экран боя: синхронизация с сервером, HUD, карта, отчёт. |
| `Auth.tsx` | Вход и регистрация. |
| `Manual.tsx` | Справочник правил. |
| `editorMap.tsx` | Редактор карты и сценария. |
| `editorUnit.tsx` | Редактор юнита каталога (для админа). |
| `battleReportLog.ts` | Разбор строк боевого лога для UI. |
| `battleReportReplay.ts` | Подсветки для «replay» по логу. |
| `battleReportVisibility.ts` | Фильтрация видимости строк отчёта. |
| `battlePageUtils.ts` | Вспомогательные функции страницы боя. |

### Хуки боя — `pages/hooks/`

| Файл | Описание |
|------|----------|
| `useBattleHudLayout.ts` | Геометрия панелей HUD. |
| `useBattleReportRows.ts` | Строки отчёта для списка. |
| `useBattleViewState.ts` | Режимы отображения (панели, выбор). |
| `useBattleDerivedState.ts` | Производное состояние из данных комнаты и клеток. |
| `useBattleUiActions.ts` | Отправка приказов, готовность хода и др. действия UI. |

---

## Клиент: компоненты — `client/src/components/`

### Карта (Canvas)

| Файл | Описание |
|------|----------|
| `map/Cells.tsx` | **`canvas`**, цикл **`draw()`**, события мыши, вызов **`drawCellsCanvas`**. |
| `map/cellsDraw.ts` | **`drawCellsCanvas`** — отрисовка всех гексов, зданий, слоёв. |
| `map/cellsDrawBase.ts` | Цвета рельефа, контуры гекса, размеры и позиции юнитов. |
| `map/cellsDrawUnits.ts` | Отрисовка юнитов и боевых декалей на клетке. |
| `map/cellsDrawOverlays.ts` | Пути, маркеры движения. |
| `map/cellsInteraction.ts` | Перевод координат мыши → гекс / юнит. |
| `map/CellContextMenus.tsx` | Контекстные меню клетки и юнита в редакторе. |
| `map/useCellsAssets.ts` | Загрузка и кеш текстур и PNG-декалей. |

### Бой — `components/battle/`

| Файл | Назначение |
|------|------------|
| `BattleMapStage.tsx` | Обёртка карты боя, формирование приказов по клику. |
| `BattleToolbar.tsx` | Счётчик хода и действия панели. |
| `BattleSidePanel.tsx` | Боковая колонка. |
| `BattleUnitOrdersPanel.tsx` | Приказы выбранного юнита. |
| `BattleMapHud.tsx` | Оверлей подсказок над картой. |
| `BattleUnitTipCard.tsx` | Карточка статуса юнита. |
| `BattleCenterModals.tsx` | Центральные модальные окна. |
| `BattleActionModals.tsx` | Модалки действий (БК и т.п.). |
| `BattleResolvingOverlay.tsx` | Индикация расчёта хода. |

### Прочие папки компонентов

| Папка | Содержимое |
|-------|------------|
| `main/` | **`MainBlock`**, **`ListServer`**, **`Room`**, **`CreateServerPanel`**, **`CreateLobby`**. |
| `lobby/` | **`LobbyPlayersPanel`**, **`LobbyMissionPanels`**. |
| `manual/` | **`ManualSidebar`**, секции карточек, **`ManualCard`**, **`ManualRuleCard`**. |
| `editorMap/` | Тулбар, панели, палитра, модалки сохранения/экспорта/сетки/гайда. |
| `editorUnit/` | Тулбар, сайдбар, рабочая область редактора юнита. |

### Маршрутизация и общие UI

| Файл | Описание |
|------|----------|
| `routing/RequireAuth.tsx` | Доступ только после входа. |
| `routing/RequireGuest.tsx` | Страница входа только для гостей. |
| `routing/RequireCatalogEditorAdmin.tsx` | Доступ к редактору юнитов каталога. |
| `Modal.tsx`, `Button.tsx`, `BodyBackground.tsx` | Общие элементы интерфейса. |

---

## Клиент: игровая логика в браузере — `client/src/game/`

Подсказки и превью; авторитетное состояние боя — на сервере.

| Файл | Описание |
|------|----------|
| `hexGrid.ts` | Геометрия сетки для отображения. |
| `hexVisibility.ts` | Видимость/туман для подсветки на клиенте. |
| `battleSync.ts` | Согласование состояния с ответами API. |
| `battleUnits.ts` | Хелперы по юнитам. |
| `battleUnitStatsTip.ts` | Тексты для подсказок статов. |
| `battleDefendSector.ts` | Клиентский расчёт сектора обороны (подсветка). |
| `battleMovePreview.ts` | Достижимые клетки для превью хода. |
| `battleFirePreview.ts` | Превью огня и целей. |
| `battleLogisticsUi.ts` | Подсказки для логистики. |
| `battleMapFit.ts` | Вписывание карты в окно. |
| `battleOrderIcons.ts` | Иконки типов приказов. |

---

## Клиент: утилиты — `client/src/utils/`

| Файл | Описание |
|------|----------|
| `catalogEditorAdmin.ts` | Проверка «админ каталога» на клиенте (согласовано с серверной политикой). |

---

## Отрисовка карты на клиенте (подробно)

Карта **не собирается из большого числа DOM-узлов**: используется **один элемент `<canvas>`** и **процедурная перерисовка** при изменении данных или указателя мыши.

1. **Компонент `client/src/components/map/Cells.tsx`**  
   Хранит ссылку на canvas, размеры **`width` × `height`** и **`cellSize`**. Функция **`draw()`** вызывает **`drawCellsCanvas`** из **`cellsDraw.ts`**. Перерисовка выполняется из **`useEffect`** при изменении массива **`cells`**, подсветок, тумана, размеров окна и версии текстур (**`textureVersion`** из **`useCellsAssets`**), а также после **`mousemove` / `mouseleave`** для обновления hover-состояния.

2. **Геометрия гекса**  
   По координатам клетки (**`coor`**) вычисляются **центр** и **вершины** шестиугольника (хелперы в **`cellsInteraction.ts`**). Те же функции используются **в обратную сторону**: координаты курсора на canvas → «попали ли в данный гекс / в иконку юнита».

3. **Порядок слоёв (логика отрисовки)**  
   - подложка местности: текстура типа гекса (**`getTexture`**) или запасной цвет (**`cellsDrawBase.ts`**);  
   - при наличии данных — **здание** (**`mapBuilding`**) — изображение или заглушка (**`cellsDraw.ts`**, функция отрисовки зданий);  
   - **оверлеи боя/редактора**: достижимые клетки, сектор обороны/артиллерии, огонь по площади, туман, маркеры отчёта и т.д. (набор зависит от пропсов **`Cells`**);  
   - **юниты** — колбэк **`drawUnits`** → **`cellsDrawUnits.ts`** (спрайты, декали приказов, индикатор подавления и др.);  
   - **путь перемещения** и связанные декали — **`cellsDrawOverlays.ts`**.

4. **Режимы**  
   Проп **`mode: 'editor' | 'battle'`** и флаг **`lobbyPreview`** меняют курсор, масштаб иконок юнитов и доступность контекстных меню; **`CellContextMenus.tsx`** рендерится **поверх** canvas для редактора.

5. **Превью на клиенте**  
   Модули **`client/src/game/`** (**`battleMovePreview`**, **`battleFirePreview`**, **`hexVisibility`**, **`battleDefendSector`** и др.) нужны для **подсказок и подсветки до отправки приказа**. После расчёта хода **авторитетное** состояние поля приходит в **`battleCells`** из ответа **`GET /api/rooms/:id`**.

---

## Карта и сценарий: от сохранения до боя

### Что хранится в `saved_map.payload`

При сохранении карты из редактора в PostgreSQL в JSON **`payload`** (таблица **`saved_map`**, см. **`routes/maps/handlers.js`** и клиент **`pages/editorMap.tsx`**) попадает, как минимум:

| Часть payload | Назначение |
|---------------|------------|
| **`cells`** | Массив клеток: координаты, тип местности/картинка, **`units`** на гексах со ссылкой на **`id` записи каталога** и **`instanceId`** на поле, при необходимости **`mapBuilding`** и др. |
| **`conditions`** | Условия миссии для **игрового движка сценария** (задачи сторон, лимит ходов и т.п.) — загружаются в **`room.battleMapConditions`** и участвуют в **`applyScenarioResolution`** после хода. |
| **`scenario`** | Данные преимущественно для **интерфейса**: брифинг, исторический текст, фото и др.; не заменяют серверный расчёт боя, но отображаются в лобби/мануале. |

### Лобби: привязка комнаты к карте

1. **`POST /api/rooms`** с **`mapId`**: сервер проверяет наличие карты и **право хоста** использовать её (своя карта, «официальная» по политике автора или хост — админ карт). В комнату пишутся **`room.mapId`** и строковое **`room.map`** (имя для списка).

2. **`GET /api/rooms/:id/lobby-map`** (**`lobbyRoutes.js`**): по **`room.mapId`** читается строка **`saved_map`**; клиент получает **`payload`** для **превью карты и сценария** до нажатия «начать бой».

### Старт боя на сервере

**`POST /api/rooms/:id/start-battle`** (только хост, после **`validateBattleStart`**):

1. **`loadBattleCellsFromMapId(pool, room.mapId)`** (`battleEnrich.js`) читает **`payload.cells`** из БД и делает **глубокую копию** массива клеток — это чертёж поля в памяти комнаты.

2. **`enrichBattleCells(pool, cells)`** — для юнитов с **`id` из каталога** выполняется запрос к таблицам **`unit`**, **`unit_damage`**, **`unit_property`** и на объекты на карте дописываются **ОП**, **нормализованные таблицы огня**, **БК**, **массив свойств** (`prop_key`) и т.д. Так бой опирается на **актуальный каталог**, а не только на «снимок» в JSON карты.

3. **`loadBattleMapConditionsFromMapId`** извлекает **`payload.conditions`** → **`room.battleMapConditions`**. После каждого завершённого такта **`battleRoutes`** вызывает **`applyScenarioResolution`**, который может завершить миссию по этим условиям.

4. Результат: **`room.battleCells`** и связанные поля готовы; **`battleStartedAt`** выставлен; **`battleLog`** и черновики приказов сброшены.

### Отображение в бою

Ответ **`GET /api/rooms/:id`** через **`roomDetailPayload`** при активном бое включает **`battleCells`** (и **`battleLog`**). Страница **`Battle.tsx`** передаёт массив клеток в **`BattleMapStage`** → компонент **`Cells`** в режиме **`battle`**, и canvas **перерисовывается** по данным с сервера после каждого опроса и завершения хода.

**Кратко:** геометрия поля и расстановка — в **`payload.cells`**; **правила победы/лимиты** — в **`payload.conditions`**; **тексты миссии** — в **`payload.scenario`**; при старте боя сервер **обогащает** юнитов из БД каталога и ведёт расчёт самостоятельно.

---

## Поток боевого хода (синхронизация)

1. Игроки в текущем **`battleTurnIndex`** отправляют **`POST /api/rooms/:id/battle/orders`** — сервер валидирует и кладёт черновик в **`battleOrdersDraft[key]`**.
2. **`POST …/battle/turn-ready`** добавляет игрока в **`battleTurnAck`**.
3. Когда отмечены все участники с фракциями **`rkka`** и **`wehrmacht`**, сервер вызывает **`buildMergedOrders`** и один раз **`resolveTurn`**, увеличивает **`battleTurnIndex`**, очищает черновики и ack.

См. **`server/routes/rooms/battleRoutes.js`**, **`server/game/lib/scenario/battleTurnResolution.js`**.

---

## Зависимости (кратко)

**Клиент** (`aov/package.json`): React 19, React Router 7, Vite 7, TypeScript, ESLint; Konva/react-konva в зависимостях при необходимости для отдельных сцен.

**Сервер** (`server/package.json`): Express, **pg**, **jsonwebtoken**, **bcrypt**, **cors**, **cookie-parser**, **dotenv**, **multer**, **nodemon** (dev).

---

## Безопасность и ограничения

- Игровые правила и разрешение хода выполняются **только на сервере**.
- Пароли хранятся как **bcrypt-хэши**.
- JWT в **httpOnly** cookie; CORS привязан к **`CLIENT_ORIGIN`**.
- Состояние боя в памяти: при **нескольких инстансах** Node без общего стора комнаты расходятся — для масштабирования нужен общий backend (Redis и т.п.).

---

## Лицензия и авторство

Укажите лицензию и авторов по требованиям учебного заведения.

---

*Обзор структуры исходного кода Art of Victory. При добавлении файлов обновляйте разделы.*
