npm i

Для создания аккаунтов в towns вам нужно:
TXT/
├── metamask_seedphrases.txt  # сид-фразы, каждая с новой строки
├── icloud_emails.txt         # cloud почты, каждая с новой строки
├── gmail_config.txt         # gmail и пароль (один для всех) - туда будут приходить коды с icloud (должна быть настроена переадресация на эту почту)
├── proxies.txt             # прокси, каждый с новой строки
└── user_agents.txt         # user-agent, каждый с новой строки

Запустить создание профилей:
node init-profiles.js
пример вывода
**![alt text](image.png)**

Затем запускать towns.js для каждого профиля по очереди:
node init-profiles.js
node run-profiles.js


http://user1:pass1@proxy1.example.com:8080
http://user2:pass2@proxy2.example.com:1080
http://user3:pass3@proxy3.example.com:3128 

chrome-extension://gmceimbnmgifdccfpmhlphflblhabeih/home.html