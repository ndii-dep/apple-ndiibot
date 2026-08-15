/* 
 * apple-ndiibot
 * created by ndii
 * © 2026
 */

const axios = require('axios')

// Memory untuk menyimpan session pencarian
const pinMemory = new Map()

// Helper function untuk download image dengan retry
async function downloadImage(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
                }
            })
            return Buffer.from(response.data)
        } catch (error) {
            if (i === maxRetries - 1) throw error
            await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)))
        }
    }
}

// Helper function untuk format file size
function formatSize(bytes) {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`
    return `${mb.toFixed(2)} MB`
}

// Helper function untuk membersihkan session expired
function cleanupSessions() {
    const now = Date.now()
    for (const [key, data] of pinMemory.entries()) {
        if (now - data.timestamp > 10 * 60 * 1000) { // 10 menit
            pinMemory.delete(key)
        }
    }
}

// Jalankan cleanup setiap 5 menit
setInterval(cleanupSessions, 5 * 60 * 1000)

module.exports = {
    name: 'pinterest-search',
    description: 'Cari gambar dari Pinterest',
    version: '1.0.0',
    author: 'ndii',
    
    commands: [
        {
            command: 'pin',
            alias: ['pinterest', 'pinsearch', 'caripin', 'gambar'],
            permission: 0,
            category: 'search',
            description: 'Cari gambar di Pinterest',
            usage: '.pin [query]',
            
            handler: async (context, args) => {
                const { sock, from, sender, config, pushName } = context
                
                const query = args.join(' ')
                
                if (!query) {
                    await sock.sendMessage(from, {
                        text: `❌ *FORMAT SALAH*\n\n` +
                              `Masukkan query pencarian!\n\n` +
                              `Format: ${config.prefix[0]}pin [query]\n\n` +
                              `Contoh:\n` +
                              `${config.prefix[0]}pin wallpaper anime\n` +
                              `${config.prefix[0]}pin logo gaming\n` +
                              `${config.prefix[0]}pin aesthetic wallpaper\n\n` +
                              `Fitur:\n` +
                              `• 10 gambar per halaman\n` +
                              `• Navigasi dengan tombol Next\n` +
                              `• Download langsung`
                    })
                    return
                }
                
                // Check limit
                const user = context.db.getUser(sender)
                if (user && user.limit < 2 && !user.premium) {
                    await sock.sendMessage(from, {
                        text: `❌ *LIMIT TIDAK CUKUP*\n\n` +
                              `Dibutuhkan: 2 limit\n` +
                              `Sisa limit: ${user.limit}\n\n` +
                              `💎 Upgrade ke premium untuk unlimited.`
                    })
                    return
                }
                
                const loadingMsg = await sock.sendMessage(from, {
                    text: `🔎 *MENCARI GAMBAR...*\n\n` +
                          `📝 Query: "${query}"\n` +
                          `👤 User: @${sender.split('@')[0]}\n\n` +
                          `_Mohon tunggu sebentar..._`,
                    mentions: [sender]
                })
                
                try {
                    const { data } = await axios.get(
                        'https://api.siputzx.my.id/api/s/pinterest',
                        {
                            params: { query, type: 'image' },
                            timeout: 30000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
                            }
                        }
                    )
                    
                    if (!data?.data?.length) {
                        await sock.sendMessage(from, {
                            text: `❌ *TIDAK DITEMUKAN*\n\n` +
                                  `Query: "${query}"\n\n` +
                                  `Tips:\n` +
                                  `• Gunakan kata kunci yang lebih umum\n` +
                                  `• Coba dengan bahasa Inggris\n` +
                                  `• Hindari karakter khusus`
                        })
                        return
                    }
                    
                    // Filter hasil yang valid
                    const results = data.data.filter(v => v.image_url)
                    
                    if (!results.length) {
                        await sock.sendMessage(from, {
                            text: '❌ Tidak ada gambar yang valid ditemukan'
                        })
                        return
                    }
                    
                    // Simpan session
                    const key = Date.now().toString()
                    pinMemory.set(key, {
                        results: results,
                        index: 0,
                        chatId: from,
                        sender: sender,
                        query: query,
                        timestamp: Date.now()
                    })
                    
                    // Hapus loading message
                    try {
                        await sock.sendMessage(from, {
                            delete: loadingMsg.key
                        })
                    } catch (error) {
                        // Ignore delete error
                    }
                    
                    // Kirim halaman pertama
                    await sendPinterestPage(sock, from, sender, key, pinMemory, config)
                    
                    // Deduct limit
                    if (user && !user.premium) {
                        context.db.updateUser(sender, {
                            limit: user.limit - 2
                        })
                    }
                    
                } catch (error) {
                    console.error('Error in pin search:', error)
                    
                    try {
                        await sock.sendMessage(from, {
                            delete: loadingMsg.key
                        })
                    } catch (deleteError) {}
                    
                    await sock.sendMessage(from, {
                        text: `❌ *ERROR AMBIL DATA*\n\n` +
                              `Error: ${error.message}\n\n` +
                              `Silakan coba lagi nanti.`
                    })
                }
            }
        },
        {
            command: 'pinnext',
            alias: ['pinlanjut', 'nextpin'],
            permission: 0,
            category: 'search',
            description: 'Lanjut ke halaman berikutnya',
            usage: '.pinnext',
            
            handler: async (context, args) => {
                const { sock, from, sender, config } = context
                
                // Cari session aktif untuk user ini
                let activeKey = null
                for (const [key, data] of pinMemory.entries()) {
                    if (data.sender === sender && data.chatId === from) {
                        activeKey = key
                        break
                    }
                }
                
                if (!activeKey) {
                    await sock.sendMessage(from, {
                        text: `❌ *TIDAK ADA SESSION*\n\n` +
                              `Tidak ada pencarian aktif.\n` +
                              `Gunakan ${config.prefix[0]}pin [query] untuk mencari gambar.`
                    })
                    return
                }
                
                const data = pinMemory.get(activeKey)
                
                if (!data) {
                    await sock.sendMessage(from, {
                        text: '❌ Session expired, silakan cari lagi'
                    })
                    return
                }
                
                await sendPinterestPage(sock, from, sender, activeKey, pinMemory, config)
            }
        }
    ]
}

// Function untuk mengirim halaman Pinterest
async function sendPinterestPage(sock, from, sender, key, pinMemory, config) {
    const data = pinMemory.get(key)
    
    if (!data) {
        await sock.sendMessage(from, {
            text: '❌ *DATA EXPIRED*\n\nSession telah berakhir, silakan cari lagi.'
        })
        return
    }
    
    const start = data.index
    const end = start + 10
    const slice = data.results.slice(start, end)
    
    if (!slice.length) {
        await sock.sendMessage(from, {
            text: '❌ *GAMBAR HABIS*\n\n' +
                  'Semua gambar sudah ditampilkan.\n' +
                  'Gunakan .pin untuk pencarian baru.'
        })
        pinMemory.delete(key)
        return
    }
    
    const pageNumber = Math.floor(start / 10) + 1
    const totalPages = Math.ceil(data.results.length / 10)
    
    // Kirim header
    await sock.sendMessage(from, {
        text: `📌 *PINTEREST RESULT*\n\n` +
              `🔍 Query: ${data.query}\n` +
              `📄 Halaman: ${pageNumber}/${totalPages}\n` +
              `🖼️ Total: ${data.results.length} gambar\n` +
              `📊 Menampilkan: ${start + 1}-${Math.min(end, data.results.length)}\n\n` +
              `_Mengirim gambar..._`
    })
    
    // Kirim gambar satu per satu (WhatsApp tidak support media group)
    for (let i = 0; i < slice.length; i++) {
        const image = slice[i]
        
        try {
            // Download image
            const imageBuffer = await downloadImage(image.image_url)
            
            // Check size
            if (imageBuffer.length > 5 * 1024 * 1024) { // 5MB
                await sock.sendMessage(from, {
                    text: `⚠️ Gambar ${start + i + 1} terlalu besar (${formatSize(imageBuffer.length)})\n` +
                          `🔗 URL: ${image.image_url}`
                })
                continue
            }
            
            // Kirim gambar
            const caption = i === 0 
                ? `📌 *Pinterest - ${data.query}*\n` +
                  `📄 Halaman ${pageNumber}/${totalPages}\n` +
                  `🖼️ Gambar ${start + i + 1} dari ${data.results.length}`
                : `🖼️ Gambar ${start + i + 1} dari ${data.results.length}`
            
            await sock.sendMessage(from, {
                image: imageBuffer,
                caption: caption
            })
            
            // Delay untuk menghindari rate limit
            await new Promise(resolve => setTimeout(resolve, 1000))
            
        } catch (error) {
            console.error(`Error sending image ${start + i + 1}:`, error)
            
            await sock.sendMessage(from, {
                text: `⚠️ Gagal mengirim gambar ${start + i + 1}\n` +
                      `🔗 URL: ${image.image_url}`
            })
        }
    }
    
    // Update index
    data.index += 10
    pinMemory.set(key, data)
    
    // Kirim tombol next jika masih ada gambar
    if (data.index < data.results.length) {
        const remaining = data.results.length - data.index
        
        const buttonMessage = {
            text: `➡️ *LANJUT?*\n\n` +
                  `Sisa gambar: ${remaining}\n` +
                  `Halaman berikutnya: ${pageNumber + 1}/${totalPages}\n\n` +
                  `Klik tombol di bawah atau ketik ${config.prefix[0]}pinnext`,
            footer: 'Pinterest Search',
            buttons: [
                {
                    buttonId: `pin_next_${key}`,
                    buttonText: {
                        displayText: `⬇️ Next ${Math.min(10, remaining)}`
                    },
                    type: 1
                },
                {
                    buttonId: `pin_stop_${key}`,
                    buttonText: {
                        displayText: '❌ Stop'
                    },
                    type: 1
                }
            ],
            headerType: 1
        }
        
        await sock.sendMessage(from, buttonMessage)
    } else {
        await sock.sendMessage(from, {
            text: `✅ *SELESAI*\n\n` +
                  `Semua gambar sudah ditampilkan.\n` +
                  `Total: ${data.results.length} gambar\n\n` +
                  `Gunakan ${config.prefix[0]}pin untuk pencarian baru.`
        })
        
        pinMemory.delete(key)
    }
}

// Export untuk digunakan di start.js
module.exports.getPinMemory = () => pinMemory
module.exports.sendPinterestPage = sendPinterestPage
