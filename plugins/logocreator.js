/* 
 * apple-ndiibot
 * created by ndii
 * © 2026
 */

const axios = require('axios')

// Store untuk menyimpan session pembuatan logo
const logoSessions = new Map()

// Helper function untuk download image dengan retry
async function downloadImage(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                timeout: 120000, // 2 menit
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
                }
            })
            return Buffer.from(response.data)
        } catch (error) {
            if (i === maxRetries - 1) throw error
            await new Promise(resolve => setTimeout(resolve, 3000 * (i + 1)))
        }
    }
}

module.exports = {
    name: 'logo-creator',
    description: 'Membuat logo AI dengan berbagai model',
    version: '1.0.0',
    author: 'ndii',
    
    commands: [
        {
            command: 'createlogo',
            alias: ['logomaker', 'buatlogo', 'logoai', 'logodesign'],
            permission: 0,
            category: 'ai',
            description: 'Membuat logo dengan AI',
            usage: '.createlogo [prompt logo]',
            
            handler: async (context, args) => {
                const { sock, from, sender, config, pushName } = context
                
                const prompt = args.join(' ').trim()
                
                if (!prompt) {
                    await sock.sendMessage(from, {
                        text: `❌ *FORMAT SALAH*\n\n` +
                              `Masukkan prompt logo\n\n` +
                              `Format: ${config.prefix[0]}createlogo [prompt]\n\n` +
                              `Contoh:\n` +
                              `${config.prefix[0]}createlogo logo coding dengan nama IkyyXD\n` +
                              `${config.prefix[0]}createlogo logo gaming keren dengan nama ndii\n\n` +
                              `Tips:\n` +
                              `• Jelaskan style logo (modern, minimalist, 3D, dll)\n` +
                              `• Sebutkan warna yang diinginkan\n` +
                              `• Tambahkan nama brand/logo`
                    })
                    return
                }
                
                // Check limit
                const user = context.db.getUser(sender)
                if (user && user.limit < 5 && !user.premium) {
                    await sock.sendMessage(from, {
                        text: `❌ *LIMIT TIDAK CUKUP*\n\n` +
                              `Dibutuhkan: 5 limit\n` +
                              `Sisa limit: ${user.limit}\n\n` +
                              `💎 Upgrade ke premium untuk unlimited limit.`
                    })
                    return
                }
                
                // Simpan session
                const sessionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                logoSessions.set(sender, {
                    prompt: prompt,
                    timestamp: Date.now()
                })
                
                // Buat button interaktif
                const buttonMessage = {
                    text: `🎨 *PILIH MODEL LOGO*\n\n` +
                          `📝 *Prompt:*\n${prompt}\n\n` +
                          `Silakan pilih model AI untuk membuat logo:`,
                    footer: 'Logo akan dibuat dalam beberapa menit',
                    buttons: [
                        {
                            buttonId: `logo_sora_${sessionId}`,
                            buttonText: {
                                displayText: '🎨 Sora AI'
                            },
                            type: 1
                        },
                        {
                            buttonId: `logo_photiu_${sessionId}`,
                            buttonText: {
                                displayText: '🖼️ Photiu AI'
                            },
                            type: 1
                        },
                        {
                            buttonId: `logo_cancel_${sessionId}`,
                            buttonText: {
                                displayText: '❌ Batal'
                            },
                            type: 1
                        }
                    ],
                    headerType: 1
                }
                
                await sock.sendMessage(from, buttonMessage)
                
                // Set timeout untuk session
                setTimeout(() => {
                    if (logoSessions.has(sender)) {
                        logoSessions.delete(sender)
                    }
                }, 5 * 60 * 1000) // 5 menit
            }
        },
        {
            command: 'logosora',
            alias: ['soralogo', 'logodalle'],
            permission: 0,
            category: 'ai',
            description: 'Membuat logo dengan Sora AI langsung',
            usage: '.logosora [prompt logo]',
            
            handler: async (context, args) => {
                const { sock, from, sender, config } = context
                
                const prompt = args.join(' ').trim()
                
                if (!prompt) {
                    await sock.sendMessage(from, {
                        text: `❌ *FORMAT SALAH*\n\n` +
                              `Format: ${config.prefix[0]}logosora [prompt]\n\n` +
                              `Contoh:\n` +
                              `${config.prefix[0]}logosora logo gaming keren`
                    })
                    return
                }
                
                // Check limit
                const user = context.db.getUser(sender)
                if (user && user.limit < 5 && !user.premium) {
                    await sock.sendMessage(from, {
                        text: `❌ *LIMIT TIDAK CUKUP*\n\n` +
                              `Dibutuhkan: 5 limit\n` +
                              `Sisa limit: ${user.limit}`
                    })
                    return
                }
                
                await sock.sendMessage(from, {
                    text: `⏳ *MEMBUAT LOGO DENGAN SORA AI*\n\n` +
                          `📝 Prompt: ${prompt}\n\n` +
                          `_Proses ini mungkin memakan waktu 1-3 menit..._`
                })
                
                try {
                    const api = `https://api.ikyyxd.my.id/ai/text2img?apikey=kyzz&text=${encodeURIComponent(prompt)}`
                    
                    const { data } = await axios.get(api, {
                        timeout: 0,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
                        }
                    })
                    
                    const imageUrl = data?.result?.url || data?.result?.image || data?.url
                    
                    if (!imageUrl) {
                        throw new Error('Image tidak ditemukan')
                    }
                    
                    // Download image
                    await sock.sendMessage(from, { text: '📥 Downloading logo...' })
                    const imageBuffer = await downloadImage(imageUrl)
                    
                    // Send logo
                    await sock.sendMessage(from, {
                        image: imageBuffer,
                        caption: `✅ *LOGO BERHASIL DIBUAT*\n\n` +
                                `🎨 Model: Sora AI\n` +
                                `📝 Prompt: ${prompt}\n` +
                                `🕒 Waktu: ${new Date().toLocaleString('id-ID')}`
                    })
                    
                    // Deduct limit
                    if (user && !user.premium) {
                        context.db.updateUser(sender, {
                            limit: user.limit - 5
                        })
                    }
                    
                } catch (error) {
                    console.error('Error in logosora:', error)
                    await sock.sendMessage(from, {
                        text: `❌ *GAGAL MEMBUAT LOGO*\n\n` +
                              `Error: ${error.message}\n\n` +
                              `Silakan coba lagi dengan prompt yang berbeda.`
                    })
                }
            }
        },
        {
            command: 'logophotiu',
            alias: ['photiulogo', 'logophotio'],
            permission: 0,
            category: 'ai',
            description: 'Membuat logo dengan Photiu AI langsung',
            usage: '.logophotiu [prompt logo]',
            
            handler: async (context, args) => {
                const { sock, from, sender, config } = context
                
                const prompt = args.join(' ').trim()
                
                if (!prompt) {
                    await sock.sendMessage(from, {
                        text: `❌ *FORMAT SALAH*\n\n` +
                              `Format: ${config.prefix[0]}logophotiu [prompt]\n\n` +
                              `Contoh:\n` +
                              `${config.prefix[0]}logophotiu logo minimalist modern`
                    })
                    return
                }
                
                // Check limit
                const user = context.db.getUser(sender)
                if (user && user.limit < 5 && !user.premium) {
                    await sock.sendMessage(from, {
                        text: `❌ *LIMIT TIDAK CUKUP*\n\n` +
                              `Dibutuhkan: 5 limit\n` +
                              `Sisa limit: ${user.limit}`
                    })
                    return
                }
                
                await sock.sendMessage(from, {
                    text: `⏳ *MEMBUAT LOGO DENGAN PHOTIU AI*\n\n` +
                          `📝 Prompt: ${prompt}\n\n` +
                          `_Proses ini mungkin memakan waktu 1-3 menit..._`
                })
                
                try {
                    const api = `https://api.ikyyxd.my.id/ai/photiu?prompt=${encodeURIComponent(prompt)}`
                    
                    const { data } = await axios.get(api, {
                        timeout: 0,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
                        }
                    })
                    
                    const imageUrl = data?.result?.image || data?.result?.url || data?.url
                    
                    if (!imageUrl) {
                        throw new Error('Image tidak ditemukan')
                    }
                    
                    // Download image
                    await sock.sendMessage(from, { text: '📥 Downloading logo...' })
                    const imageBuffer = await downloadImage(imageUrl)
                    
                    // Send logo
                    await sock.sendMessage(from, {
                        image: imageBuffer,
                        caption: `✅ *LOGO BERHASIL DIBUAT*\n\n` +
                                `🎨 Model: Photiu AI\n` +
                                `📝 Prompt: ${prompt}\n` +
                                `🕒 Waktu: ${new Date().toLocaleString('id-ID')}`
                    })
                    
                    // Deduct limit
                    if (user && !user.premium) {
                        context.db.updateUser(sender, {
                            limit: user.limit - 5
                        })
                    }
                    
                } catch (error) {
                    console.error('Error in logophotiu:', error)
                    await sock.sendMessage(from, {
                        text: `❌ *GAGAL MEMBUAT LOGO*\n\n` +
                              `Error: ${error.message}\n\n` +
                              `Silakan coba lagi dengan prompt yang berbeda.`
                    })
                }
            }
        }
    ]
}
