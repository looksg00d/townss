const getProfiles = require('./profiles');

async function checkConfig() {
  try {
    const profiles = await getProfiles;
    console.log('Загруженные профили:');
    
    for (const [id, profile] of Object.entries(profiles)) {
      console.log(`\n${id}:`);
      console.log(`  Имя: ${profile.name}`);
      console.log(`  iCloud Email: ${profile.icloudEmail}`);
      console.log(`  Gmail: ${profile.email}`);
      console.log(`  MetaMask Password: ${profile.metamaskPassword}`);
      console.log(`  Директория: ${profile.userDataDir}`);
    }
  } catch (error) {
    console.error('Ошибка при загрузке конфигурации:', error);
  }
}

if (require.main === module) {
  checkConfig().catch(console.error);
} 