const dev = {
    url: {
        API_URL: 'http://localhost:3000/',
        REDIRECT_URL: 'http://localhost:8080',
    }
}

const prod = {
    url: {
        API_URL: 'https://api.cloud-inventory.sheacloud.com/',
        REDIRECT_URL: 'https://cloud-inventory.sheacloud.com/',
    }
}

export const config = process.env.NODE_ENV === 'development' ? dev : prod;