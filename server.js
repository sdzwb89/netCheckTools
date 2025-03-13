const http = require('http');
const https = require('https');
const url = require('url');
const dns = require('dns');
const { performance } = require('perf_hooks');
const os = require('os');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// 获取本地IP地址
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // 跳过内部和非IPv4地址
            if (iface.internal || iface.family !== 'IPv4') {
                continue;
            }
            return iface.address;
        }
    }
    return '127.0.0.1';
}

// 解析请求体
async function parseRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(new Error('无效的JSON格式'));
            }
        });
        req.on('error', reject);
    });
}

// 执行DNS查询
async function dnsLookup(hostname) {
    return new Promise((resolve, reject) => {
        const startTime = performance.now();
        dns.lookup(hostname, { all: true }, (err, addresses) => {
            const lookupTime = Math.round(performance.now() - startTime);
            if (err) {
                return resolve({
                    hostname,
                    error: err.message,
                    lookupTime
                });
            }
            resolve({
                hostname,
                addresses: addresses.map(a => a.address),
                lookupTime
            });
        });
    });
}

// 发起HTTP/HTTPS请求并收集诊断信息
async function diagnoseUrl(targetUrl) {
    const result = {
        url: targetUrl,
        localIp: getLocalIpAddress(),
        timing: {}
    };

    try {
        // 解析URL
        const parsedUrl = new URL(targetUrl);
        
        // DNS查询
        const dnsStart = performance.now();
        result.dnsInfo = await dnsLookup(parsedUrl.hostname);
        result.timing.dns = Math.round(result.dnsInfo.lookupTime);
        
        // 准备请求选项
        const options = {
            method: 'HEAD', // 只获取头信息，不下载内容
            headers: {
                'User-Agent': 'Network-Diagnostic-Tool/1.0'
            },
            timeout: 10000 // 设置10秒超时
        };
        
        return new Promise((resolve, reject) => {
            const tcpStart = performance.now();
            
            // 选择HTTP或HTTPS模块
            const requester = parsedUrl.protocol === 'https:' ? https : http;
            
            const req = requester.request(targetUrl, options, (res) => {
                const tlsEnd = performance.now();
                result.timing.tcp = Math.round(tlsEnd - tcpStart - (parsedUrl.protocol === 'https:' ? result.timing.tls || 0 : 0));
                
                const ttfbEnd = performance.now();
                result.timing.ttfb = Math.round(ttfbEnd - tlsEnd);
                
                // 收集响应头信息
                result.statusCode = res.statusCode;
                result.responseHeaders = res.headers;
                result.contentType = res.headers['content-type'] || '';
                result.contentLength = parseInt(res.headers['content-length'] || '0', 10);
                
                // 如果只是HEAD请求，不需要接收响应体
                res.on('data', () => {});
                
                res.on('end', () => {
                    const downloadEnd = performance.now();
                    result.timing.download = Math.round(downloadEnd - ttfbEnd);
                    result.timing.total = Math.round(downloadEnd - dnsStart);
                    
                    // 获取远程IP（可能不准确，取决于服务器配置）
                    result.remoteIp = res.socket?.remoteAddress || '未知'
                    
                    resolve(result);
                });
            });
            
            // TLS连接时间（仅HTTPS）
            if (parsedUrl.protocol === 'https:') {
                req.on('socket', (socket) => {
                    socket.on('secureConnect', () => {
                        const tlsTime = performance.now();
                        result.timing.tls = Math.round(tlsTime - tcpStart);
                    });
                });
            }
            
            // 收集请求头信息
            result.requestHeaders = req.getHeaders();
            
            req.on('error', (error) => {
                result.error = error.message;
                result.timing.total = Math.round(performance.now() - dnsStart);
                resolve(result);
            });
            
            req.end();
        });
    } catch (error) {
        result.error = error.message;
        return result;
    }
}

// 创建HTTP服务器
const server = http.createServer(async (req, res) => {
    // 设置CORS头，允许跨域请求
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // 处理预检请求
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }
    
    // 解析请求URL
    const parsedUrl = url.parse(req.url, true);
    
    // 处理API请求
    if (parsedUrl.pathname === '/api/diagnose' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            
            if (!body.url) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: '缺少URL参数' }));
                return;
            }
            
            const result = await diagnoseUrl(body.url);
            
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
        } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error.message }));
        }
    }
    // 处理静态文件请求
    else if (req.method === 'GET') {
        let filePath;
        if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html') {
            filePath = path.join(__dirname, 'index.html');
        } else {
            filePath = path.join(__dirname, parsedUrl.pathname);
        }
        
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.statusCode = 404;
                res.end('文件未找到');
                return;
            }
            
            // 根据文件扩展名设置Content-Type
            const ext = path.extname(filePath);
            let contentType = 'text/html';
            
            switch (ext) {
                case '.js':
                    contentType = 'text/javascript';
                    break;
                case '.css':
                    contentType = 'text/css';
                    break;
                case '.json':
                    contentType = 'application/json';
                    break;
                case '.png':
                    contentType = 'image/png';
                    break;
                case '.jpg':
                case '.jpeg':
                    contentType = 'image/jpeg';
                    break;
            }
            
            res.setHeader('Content-Type', contentType);
            res.end(data);
        });
    } else {
        res.statusCode = 404;
        res.end('Not Found');
    }
});

// 启动服务器
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});