# AI Business Academy на VPS

Този пакет пуска основното Next.js приложение с постоянна SQLite база и файлово хранилище. Не включва личните данни и паролите от локалната машина. Сървърът започва с празна база. Контейнерите се изпълняват като непривилегирования потребител `node`.

Нужни са Linux VPS, Git, Docker Engine с Compose v2 и домейн, насочен към VPS. Използвай един app контейнер на един сървър: текущата SQLite архитектура не е конфигурация за множество реплики. Ollama не е необходим за вградения дизайнер на сайтове; AI агентите изискват отделно свързан модел.

## 1. Клониране и настройка

За частното хранилище използвай GitHub deploy key с достъп само за четене или собствен удостоверен GitHub CLI. Не поставяй токен в URL адреса на хранилището.

```bash
git clone git@github.com:angelmalevbiz-debug/ai-business-academy.git ai-business-academy
cd ai-business-academy
cp deploy/vps.env.example .env
chmod 600 .env
nano .env
```

Задай `APP_ORIGIN=https://твоя-домейн` без наклонена черта накрая. Не използвай локалния `.env.local` на работния компютър. Настройките за Google, GitHub и Vercel са по избор и изискват регистрирано provider приложение. Callback адресът е `{APP_ORIGIN}/api/connections/{google|github|vercel}/callback`.

```bash
docker compose config --quiet
docker compose up -d --build app
docker compose ps
curl --fail --silent --output /dev/null http://127.0.0.1:3100/
```

Порт 3100 е достъпен само на loopback на VPS. Отвори публично само SSH и портовете на HTTPS reverse proxy. Healthcheck проверява HTTP отговора на приложението; не проверява AI моделите, база данни или правата за публикуване.

## 2. Домейн и HTTPS

Примерът е за Ubuntu/Debian с Nginx. Замени `academy.example.com` навсякъде със своя домейн, преди да активираш конфигурацията.

```bash
sudo apt-get update
sudo apt-get install nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/ai-business-academy
sudo nano /etc/nginx/sites-available/ai-business-academy
sudo ln -s /etc/nginx/sites-available/ai-business-academy /etc/nginx/sites-enabled/ai-business-academy
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d academy.example.com
```

Избери пренасочване към HTTPS. Използвай приложението през този HTTPS адрес: production cookies и provider connections изискват коректен публичен origin. Примерът не създава DNS записи и не подменя съществуваща Nginx конфигурация.

## 3. Първи администратор

Няма предварително зададени администратор или парола. Maintenance образът съдържа нужния `tsx`, а web образът е с production зависимости. Командата записва администратора в същия постоянен volume.

```bash
docker compose --profile maintenance build maintenance
read -rp 'Admin email: ' ADMIN_EMAIL
read -rp 'Admin name: ' ADMIN_NAME
read -rsp 'Admin password (12+ characters): ' ADMIN_PASSWORD
printf '\n'
export ADMIN_EMAIL ADMIN_NAME ADMIN_PASSWORD
docker compose --profile maintenance run --rm -e ADMIN_EMAIL -e ADMIN_NAME -e ADMIN_PASSWORD maintenance npm run admin:create
unset ADMIN_EMAIL ADMIN_NAME ADMIN_PASSWORD
```

След това влез през HTTPS домейна. Паролата не се записва в shell history или `.env`. Повторно създаване със същия имейл се отказва; това не е команда за смяна на парола.

## 4. Постоянни данни и резервни копия

Volume `academy-data` е монтиран на `/app/.data`. Той съдържа базата, снимките за сайтове, медийните файлове и worker heartbeat данните. `docker compose down` го запазва. **Не използвай `docker compose down -v`**, освен ако умишлено изтриваш всички потребителски данни.

За онлайн проверено копие само на SQLite базата:

```bash
docker compose --profile maintenance run --rm -e BACKUP_PATH=/app/.data/backups/manual.db maintenance npm run db:backup
mkdir -p backups
chmod 700 backups
docker compose cp app:/app/.data/backups/manual.db ./backups/manual.db
```

Избери ново име при следващо копие. Скриптът отказва презаписване и проверява `integrity_check`. Това копие не съдържа снимките и останалите файлове. За цялостно възстановяване архивирай целия volume при спрени app и worker процеси:

```bash
docker compose --profile workflow stop worker app
docker compose --profile maintenance run --rm maintenance tar -czf /app/.data/full-backup.tar.gz --exclude=./full-backup.tar.gz --exclude=./backups -C /app/.data .
docker compose --profile maintenance run --rm -T maintenance cat /app/.data/full-backup.tar.gz > ./backups/full-backup.tar.gz
docker compose up -d app
```

Повторното архивиране използва същото име: изнеси и преименувай всяко копие извън VPS. Пази `.env` и encryption key отделно, криптирано и извън GitHub. Не премествай само жив `.db` файл: WAL записите може да не са в него. При възстановяване запази пътищата и собствеността UID/GID 1000 за volume. Не прехвърляй локални данни на VPS без отделно планирана миграция.

## 5. Собствен AI модел без платен API

Дизайнерът и визуалният редактор на сайтове работят с `WEBSITE_AI_PROVIDER=none`. Wikimedia Commons снимките използват интернет, без API ключ. При липсващ модел AI генерацията не се симулира.

За собствен Ollama на друга машина задавай сървърно:

```dotenv
WEBSITE_AI_PROVIDER=ollama
WEBSITE_AI_MODEL=your-installed-model
WEBSITE_OLLAMA_ORIGIN=https://ai.example.com
WEBSITE_OLLAMA_TOKEN=your-proxy-bearer-token
```

Моделът трябва вече да е инсталиран и да има собствени GGUF тегла. На Ollama хоста изключи cloud routing с `OLLAMA_NO_CLOUD=1`. Отдалеченият endpoint трябва да използва HTTPS или изрично разрешен частен IP адрес с `WEBSITE_OLLAMA_ALLOW_PRIVATE_HTTP=true`. Не излагай Ollama публично без удостоверяване. Приложението не инсталира модел или GPU драйвери.

В контейнер `127.0.0.1` означава самия контейнер. Website модулът поддържа отделен remote origin; текущият Workflow transport е ограничен до loopback. За Workflow на VPS е необходим локален authenticated gateway/sidecar в същото network namespace или промяна на transport границата. Само задаване на remote `WORKFLOW_OLLAMA_ORIGIN` няма да направи Workflow агентите работещи.

## 6. Незадължителен Workflow worker

След настройване и проверка на Workflow модела можеш да включиш фоновите текстови задачи:

```bash
docker compose --profile workflow up -d --build app worker
docker compose logs --tail=80 worker
```

Worker и app споделят PID namespace и volume, тъй като приложението проверява дали PID от heartbeat файла е жив. Не мащабирай тези услуги до множество реплики. След смяна на app контейнера пресъздай и worker (`docker compose --profile workflow up -d --force-recreate app worker`).

Python видео renderer, FFmpeg/FFprobe, `tiktok_clip_factory` и локалният publisher са отделни зависимости от предоставения преди това проект. Те не са включени в това хранилище/образ. `WORKFLOW_MEDIA_DISABLED=1` е зададен изрично. Публикуване в Instagram/TikTok, реклами, имейл изпращане и плащания не започват автоматично от deployment. Те изискват реални свързани акаунти, provider права и съответните интеграции.

## 7. Обновяване

Преди обновяване създай резервно копие на целия volume и пази използваната версия на кода. След това:

```bash
git pull --ff-only
docker compose up -d --build app
docker compose --profile maintenance build maintenance
docker compose ps
docker compose logs --tail=80 app
```

Ако worker е включен, пресъздай app и worker заедно с командата от предишната секция. Миграциите на SQLite се изпълняват от приложението. Връщане към стар image може да изисква и възстановяване на съответното резервно копие; по-стара версия отказва по-нова схема.

## Проверки на пакета

Compose конфигурацията е валидирана с примерния env файл и с активни maintenance и workflow профили. Docker CLI е наличен на разработващата Windows машина, но Docker Engine не е стартиран. Затова контейнерният Linux build, HTTPS конфигурацията и пускането на реален VPS не са потвърдени тук. Изпълни `docker compose config --quiet`, build и HTTP проверката по-горе на целевия VPS, преди да приемеш deployment за готов.
