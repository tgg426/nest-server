module.exports = {
  apps: [
    {
      name: 'Mynestapp',
      script: '/home/nest-serve-doctor/dist/src/main.js',
      exec_mode: 'cluster',
      instances: 'max',
      watch: false,
      env: {
        // 推荐直接使用系统环境变量，而不是在这里写死敏感信息
        MONGODB_URI: process.env.MONGODB_URI,
        PASSWORD_KEY: process.env.PASSWORD_KEY,
        JWT_SECRET: process.env.JWT_SECRET,
        MILVUS_ADDRESS: process.env.MILVUS_ADDRESS,
        TONGYI_AKI_KEY: process.env.TONGYI_AKI_KEY,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD,
      },
    },
  ],
};

