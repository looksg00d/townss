const { ethers } = require('ethers');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function getRandomAmount() {
    const minAmount = parseInt(process.env.MIN_AMOUNT) || 15;
    const maxAmount = parseInt(process.env.MAX_AMOUNT) || 22;
    
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
        
        const amount = await getRandomAmount();
        console.log('Отправляем транзакцию на адрес:', recipientAddress);
        console.log('Сумма:', amount, 'ETH');
        
        const tx = await wallet.sendTransaction({
            to: recipientAddress,
            value: ethers.utils.parseEther(amount),
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