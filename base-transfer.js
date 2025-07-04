const { ethers } = require('ethers');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function getRandomAmount() {
    const minAmount = parseInt(process.env.MIN_AMOUNT) || 3;
    const maxAmount = parseInt(process.env.MAX_AMOUNT) || 8;
    
    const randomNum = Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount;
    console.log('Сгенерированное число:', randomNum);
    return `0.000${randomNum}`;
} 

async function sendBaseTransaction(recipientAddress, profileId) {
    try {
        // Получаем номер профиля
        const profileNumber = parseInt(profileId.replace('profile', ''));
        
        // Читаем сид-фразы из файла
        const seedPhrasesPath = path.join(__dirname, 'TXT', 'metamask_seedphrases.txt');
        const content = await fs.readFile(seedPhrasesPath, 'utf8');
        const seedPhrases = content.split('\n').filter(line => line.trim() && !line.startsWith('//'));
        
        // Берем сид-фразу по индексу и очищаем от лишних пробелов
        const seedPhrase = seedPhrases[profileNumber - 1].trim().replace(/\s+/g, ' ');
        console.log(`Используем сид-фразу для профиля ${profileNumber}:`, seedPhrase);
        
        if (!recipientAddress.startsWith('0x')) {
            throw new Error(`Адрес должен начинаться с 0x: ${recipientAddress}`);
        }

        const provider = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');
        const wallet = ethers.Wallet.fromMnemonic(seedPhrase).connect(provider);
        
        // Получаем текущий баланс кошелька
        const balance = await wallet.getBalance();
        console.log('Текущий баланс кошелька:', ethers.utils.formatEther(balance), 'ETH');
        
        // Если баланс слишком мал, выбрасываем ошибку
        if (balance.lt(ethers.utils.parseEther('0.001'))) {
            throw new Error(`Недостаточно средств на кошельке: ${ethers.utils.formatEther(balance)} ETH`);
        }
        
        // Получаем случайную сумму для резерва
        const reserveAmount = await getRandomAmount();
        const reserveWei = ethers.utils.parseEther(reserveAmount);
        
        // Рассчитываем сумму для отправки (баланс минус резерв)
        const amountToSend = balance.sub(reserveWei);
        
        // Проверяем, что сумма для отправки положительная
        if (amountToSend.lte(0)) {
            throw new Error('После вычета резерва сумма для отправки меньше или равна нулю');
        }
        
        const sendAmountEth = ethers.utils.formatEther(amountToSend);
        
        console.log('Отправляем транзакцию на адрес:', recipientAddress);
        console.log('Сумма:', sendAmountEth, 'ETH');
        console.log('Оставляем в резерве:', reserveAmount, 'ETH');
        
        const tx = await wallet.sendTransaction({
            to: recipientAddress,
            value: amountToSend,
            chainId: 8453,
            gasLimit: 21000,
        });
        
        console.log('Транзакция отправлена:', tx.hash);
        await tx.wait();
        console.log('Транзакция подтверждена!');
        
    } catch (error) {
        console.error('Ошибка при отправке:', error);
        throw error;
    }
}

module.exports = { sendBaseTransaction }; 