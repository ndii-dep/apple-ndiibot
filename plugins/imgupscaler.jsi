/* 
 * apple-ndiibot
 * created by ndii
 * © 2026
 */

const axios = require('axios')
const FormData = require('form-data')

function generateRandomIP() {
    const r = () => Math.floor(Math.random() * 254) + 1
    return `${r()}.${r()}.${r()}.${r()}`
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function upscaleFromUrl(imageUrl, scale = "4") {
    const randomIp = generateRandomIP()
    const commonHeaders = {
        'Origin': 'https://imgupscaler.com',
        'Referer': 'https://imgupscaler.com/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        'X-Client-Ipv4': randomIp,
        'X-Forwarded-For': randomIp
    }

    try {
        const imageStream = await axios({
            method: 'GET',
            url: imageUrl,
            responseType: 'stream'
        })

        const form = new FormData()
        form.append('tool', 'upscaler')
        form.append('mode', 'batch')
        form.append('scaleRadio', scale)
        form.append('file', imageStream.data, {
            filename: 'image.jpg',
            contentType: imageStream.headers['content-type'] || 'image/jpeg'
        })

        const uploadRes = await axios.post('https://imgupscaler.com/api/legacy/upload', form, {
            headers: {
                ...form.getHeaders(),
                ...commonHeaders
            }
        })

        const taskId = uploadRes.data?.taskId
        if (!taskId) {
            return { status: false, message: 'Gagal mendapatkan taskId dari server.', raw: uploadRes.data }
        }

        let attempts = 0
        const maxAttempts = 50

        while (attempts < maxAttempts) {
            attempts++
            await sleep(2000)

            const statusRes = await axios.post('https://imgupscaler.com/api/legacy/status', 
                {
                    tool: 'upscaler',
                    taskId: taskId,
                    scaleRadio: scale
                }, 
                {
                    headers: {
                        'Content-Type': 'application/json',
                        ...commonHeaders
                    }
                }
            )

            const resData = statusRes.data

            if (resData.status === 'success' && resData.downloadUrls && resData.downloadUrls.length > 0) {
                return {
                    status: true,
                    ip_used: randomIp,
                    taskId: taskId,
                    original_filename: resData.originalFileName || null,
                    download_url: resData.downloadUrls[0]
                }
            }

            if (resData.status !== 'waiting') {
                return { status: false, message: 'Proses gagal di server.', raw: resData }
            }
        }

        return { status: false, message: 'Timeout: Proses upscale memakan waktu terlalu lama.' }

    } catch (error) {
        return {
            status: false,
            message: error.message,
            error_details: error.response ? error.response.data : null
        }
    }
}

module.exports = {
    name: 'image-upscaler',
    description: 'Upscale gambar hingga 4x menggunakan AI',
    version: '1.0.0',
    author: 'ndii',
    
    commands: [
        {
            command: 'upscale',
            alias: ['hd', 'enhance', 'jernihkan'],
            permission: 0,
            category: 'tools',
            description: 'Upscale gambar menjadi HD (4x)',
            
            handler: async (context, args) => {
                const { sock, from, sender, msgType, message, config } = context
                
                // Check if user has limit
                const user = context.db.getUser(sender)
                if (user && user.limit < 2 && !user.premium) {
                    await sock.sendMessage(from, { 
                        text: '❌ Limit tidak cukup!\n\n' +
                              'Dibutuhkan: 2 limit\n' +
                              `Sisa limit: ${user.limit}\n\n` +
                              'Upgrade ke premium untuk unlimited limit.'
                    })
                    return
                }
                
                let imageUrl = null
                
                // Check if replying to image
                if (message.message?.imageMessage) {
                    await sock.sendMessage(from, { text: '🔄 Mendownload gambar...' })
                    const buffer = await sock.downloadMediaMessage(message)
                    
                    // Upload to temporary hosting (example: catbox)
                    const form = new FormData()
                    form.append('reqtype', 'fileupload')
                    form.append('fileToUpload', buffer, {
                        filename: 'image.jpg',
                        contentType: 'image/jpeg'
                    })
                    
                    try {
                        const uploadRes = await axios.post('https://catbox.moe/user/api.php', form, {
                            headers: form.getHeaders()
                        })
                        imageUrl = uploadRes.data
                    } catch (error) {
                        await sock.sendMessage(from, { text: '❌ Gagal upload gambar sementara' })
                        return
                    }
                }
                // Check if URL provided
                else if (args[0] && (args[0].startsWith('http://') || args[0].startsWith('https://'))) {
                    imageUrl = args[0]
                }
                else {
                    await sock.sendMessage(from, {
                        text: `❌ *FORMAT SALAH*\n\n` +
                              `Cara penggunaan:\n` +
                              `1. Kirim gambar dengan caption ${config.prefix[0]}upscale\n` +
                              `2. Reply gambar dengan ${config.prefix[0]}upscale\n` +
                              `3. ${config.prefix[0]}upscale [url_gambar]\n\n` +
                              `Contoh:\n` +
                              `${config.prefix[0]}upscale https://example.com/image.jpg`
                    })
                    return
                }
                
                if (!imageUrl) {
                    await sock.sendMessage(from, { text: '❌ Tidak ada gambar yang ditemukan' })
                    return
                }
                
                // Deduct limit
                if (user && !user.premium) {
                    context.db.updateUser(sender, {
                        limit: user.limit - 2
                    })
                }
                
                await sock.sendMessage(from, { 
                    text: '🔄 *Memproses gambar...*\n\n' +
                          '⚡ Proses ini mungkin memakan waktu 1-3 menit.\n' +
                          'Mohon tunggu ya...'
                })
                
                const result = await upscaleFromUrl(imageUrl, '4')
                
                if (result.status && result.download_url) {
                    // Download the upscaled image
                    try {
                        const imageBuffer = await axios({
                            method: 'GET',
                            url: result.download_url,
                            responseType: 'arraybuffer'
                        })
                        
                        await sock.sendMessage(from, {
                            image: Buffer.from(imageBuffer.data),
                            caption: `✅ *UPSCALE BERHASIL*\n\n` +
                                    `📊 Skala: 4x\n` +
                                    `🆔 Task ID: ${result.taskId}\n` +
                                    `📝 File: ${result.original_filename || 'image.jpg'}`
                        })
                        
                        // Also send as document if large
                        if (imageBuffer.data.length > 5 * 1024 * 1024) {
                            await sock.sendMessage(from, {
                                document: Buffer.from(imageBuffer.data),
                                fileName: `upscaled_${result.original_filename || 'image.jpg'}`,
                                mimetype: 'image/jpeg',
                                caption: '📁 File HD (ukuran besar)'
                            })
                        }
                        
                    } catch (error) {
                        await sock.sendMessage(from, {
                            text: `✅ *UPSCALE BERHASIL*\n\n` +
                                  `🔗 Download URL:\n${result.download_url}\n\n` +
                                  `_URL akan expired dalam beberapa menit_`
                        })
                    }
                } else {
                    await sock.sendMessage(from, {
                        text: `❌ *UPSCALE GAGAL*\n\n` +
                              `Pesan: ${result.message || 'Terjadi kesalahan'}\n\n` +
                              `Silakan coba lagi.`
                    })
                    
                    // Refund limit if failed
                    if (user && !user.premium) {
                        context.db.updateUser(sender, {
                            limit: user.limit
                        })
                    }
                }
            }
        },
        {
            command: 'upscale2',
            alias: ['hd2', 'enhance2'],
            permission: 0,
            category: 'tools',
            description: 'Upscale gambar 2x (lebih cepat)',
            
            handler: async (context, args) => {
                const { sock, from, sender, msgType, message, config } = context
                
                const user = context.db.getUser(sender)
                if (user && user.limit < 1 && !user.premium) {
                    await sock.sendMessage(from, { 
                        text: '❌ Limit tidak cukup!\n\n' +
                              'Dibutuhkan: 1 limit\n' +
                              `Sisa limit: ${user.limit}`
                    })
                    return
                }
                
                let imageUrl = null
                
                if (message.message?.imageMessage) {
                    await sock.sendMessage(from, { text: '🔄 Mendownload gambar...' })
                    const buffer = await sock.downloadMediaMessage(message)
                    
                    const form = new FormData()
                    form.append('reqtype', 'fileupload')
                    form.append('fileToUpload', buffer, {
                        filename: 'image.jpg',
                        contentType: 'image/jpeg'
                    })
                    
                    try {
                        const uploadRes = await axios.post('https://catbox.moe/user/api.php', form, {
                            headers: form.getHeaders()
                        })
                        imageUrl = uploadRes.data
                    } catch (error) {
                        await sock.sendMessage(from, { text: '❌ Gagal upload gambar sementara' })
                        return
                    }
                }
                else if (args[0] && args[0].startsWith('http')) {
                    imageUrl = args[0]
                }
                else {
                    await sock.sendMessage(from, {
                        text: `❌ *FORMAT SALAH*\n\n` +
                              `Gunakan: ${config.prefix[0]}upscale2 [url_gambar]\n` +
                              `Atau kirim gambar dengan caption ${config.prefix[0]}upscale2`
                    })
                    return
                }
                
                if (user && !user.premium) {
                    context.db.updateUser(sender, {
                        limit: user.limit - 1
                    })
                }
                
                await sock.sendMessage(from, { text: '🔄 *Memproses gambar (2x)...*' })
                
                const result = await upscaleFromUrl(imageUrl, '2')
                
                if (result.status && result.download_url) {
                    try {
                        const imageBuffer = await axios({
                            method: 'GET',
                            url: result.download_url,
                            responseType: 'arraybuffer'
                        })
                        
                        await sock.sendMessage(from, {
                            image: Buffer.from(imageBuffer.data),
                            caption: `✅ *UPSCALE 2X BERHASIL*\n\n` +
                                    `🆔 Task ID: ${result.taskId}`
                        })
                    } catch (error) {
                        await sock.sendMessage(from, {
                            text: `✅ *UPSCALE 2X BERHASIL*\n\n` +
                                  `🔗 Download URL:\n${result.download_url}`
                        })
                    }
                } else {
                    await sock.sendMessage(from, {
                        text: `❌ *UPSCALE GAGAL*\n\n` +
                              `Pesan: ${result.message || 'Terjadi kesalahan'}`
                    })
                    
                    if (user && !user.premium) {
                        context.db.updateUser(sender, {
                            limit: user.limit
                        })
                    }
                }
            }
        }
    ]
}
