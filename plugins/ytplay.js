/* 
 * apple-ndiibot
 * created by ndii
 * © 2026
 */

const axios = require('axios')

// Helper function untuk format durasi
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
}

// Helper function untuk format views
function formatViews(views) {
    if (!views) return '0'
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K`
    return views.toString()
}

// Helper function untuk format upload date
function formatDate(dateString) {
    if (!dateString) return 'Unknown'
    try {
        const date = new Date(dateString)
        const now = new Date()
        const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24))
        
        if (diff === 0) return 'Hari ini'
        if (diff === 1) return 'Kemarin'
        if (diff < 7) return `${diff} hari yang lalu`
        if (diff < 30) return `${Math.floor(diff / 7)} minggu yang lalu`
        if (diff < 365) return `${Math.floor(diff / 30)} bulan yang lalu`
        return `${Math.floor(diff / 365)} tahun yang lalu`
    } catch {
        return dateString
    }
}

// Helper function untuk download dengan retry
async function downloadWithRetry(url, maxRetries = 3) {
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
    name: 'youtube-downloader',
    description: 'Download audio dan video dari YouTube',
    version: '1.0.0',
    author: 'ndii',
    
    commands: [
        {
            command: 'play',
            alias: ['ytplay', 'youtube', 'musik', 'lagu', 'song'],
            permission: 0,
            category: 'downloader',
            description: 'Play/download lagu dari YouTube',
            usage: '.play [judul lagu/url youtube]',
            
            handler: async (context, args) => {
                const { sock, from, sender, config, pushName } = context
                
                const query = args.join(' ')
                
                if (!query) {
                    await sock.sendMessage(from, {
                        text: `❌ *FORMAT SALAH*\n\n` +
                              `Format: ${config.prefix[0]}play [judul lagu/url]\n\n` +
                              `Contoh:\n` +
                              `${config.prefix[0]}play Shape of You\n` +
                              `${config.prefix[0]}play https://youtube.com/watch?v=xxxxx\n\n` +
                              `Fitur:\n` +
                              `• Search & download lagu\n` +
                              `• Download dari URL YouTube\n` +
                              `• Audio berkualitas tinggi`
                    })
                    return
                }
                
                // Check limit
                const user = context.db.getUser(sender)
                if (user && user.limit < 3 && !user.premium) {
                    await sock.sendMessage(from, {
                        text: `❌ *LIMIT TIDAK CUKUP*\n\n` +
                              `Dibutuhkan: 3 limit\n` +
                              `Sisa limit: ${user.limit}\n\n` +
                              `💎 Upgrade ke premium untuk unlimited limit.\n` +
                              `Ketik ${config.prefix[0]}owner untuk info.`
                    })
                    return
                }
                
                // Send initial message
                await sock.sendMessage(from, {
                    text: `🎵 *MENCARI LAGU...*\n\n` +
                          `🔍 Query: "${query}"\n` +
                          `👤 User: @${sender.split('@')[0]}\n\n` +
                          `_Mohon tunggu sebentar..._`,
                    mentions: [sender]
                })
                
                try {
                    // Search YouTube
                    const { data } = await axios.get(
                        `https://api.ikyyxd.my.id/search/ytplayv2?q=${encodeURIComponent(query)}`,
                        {
                            timeout: 30000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
                            }
                        }
                    )
                    
                    if (!data.status || !data.result) {
                        await sock.sendMessage(from, {
                            text: `❌ *LAGU TIDAK DITEMUKAN*\n\n` +
                                  `Query: "${query}"\n\n` +
                                  `Tips:\n` +
                                  `• Gunakan judul yang lebih spesifik\n` +
                                  `• Coba dengan nama artis\n` +
                                  `• Gunakan URL YouTube langsung`
                        })
                        return
                    }
                    
                    const res = data.result
                    
                    // Format info
                    const duration = formatDuration(res.duration || 0)
                    const views = formatViews(res.views)
                    const uploadDate = formatDate(res.uploadDate)
                    
                    let captionText = `╭━━━━━━━━━━━━━━━┈➤\n` +
                                     `┃🎵 *YOUTUBE PLAY*\n` +
                                     `╰━━━━━━━━━━━━━━━┈➤\n\n` +
                                     `📝 *Judul:* ${res.title}\n` +
                                     `👤 *Channel:* ${res.channel || 'Unknown'}\n` +
                                     `⏱️ *Durasi:* ${duration}\n` +
                                     `👁️ *Views:* ${views}\n` +
                                     `📅 *Upload:* ${uploadDate}\n` +
                                     `🔗 *URL:* ${res.source || res.url}\n\n`
                    
                    // Add quality info if available
                    if (res.audio?.quality || res.quality) {
                        captionText += `🎧 *Kualitas:* ${res.audio?.quality || res.quality}\n`
                    }
                    
                    if (res.audio?.size) {
                        const sizeMB = (parseInt(res.audio.size) / (1024 * 1024)).toFixed(2)
                        captionText += `💾 *Size:* ${sizeMB} MB\n`
                    }
                    
                    captionText += `\n⬇️ _Mendownload audio..._`
                    
                    // Send thumbnail with info
                    if (res.thumbnail) {
                        try {
                            await sock.sendMessage(from, {
                                image: { url: res.thumbnail },
                                caption: captionText
                            })
                        } catch (error) {
                            await sock.sendMessage(from, { text: captionText })
                        }
                    } else {
                        await sock.sendMessage(from, { text: captionText })
                    }
                    
                    // Download audio
                    const audioUrl = res.audio?.url || res.downloadUrl || res.url
                    
                    if (!audioUrl) {
                        await sock.sendMessage(from, {
                            text: `❌ *AUDIO TIDAK TERSEDIA*\n\n` +
                                  `Judul: ${res.title}\n` +
                                  `URL: ${res.source}\n\n` +
                                  `_Silakan coba lagu lain_`
                        })
                        return
                    }
                    
                    // Check file size if available
                    if (res.audio?.size && parseInt(res.audio.size) > 50 * 1024 * 1024) {
                        await sock.sendMessage(from, {
                            text: `⚠️ *FILE TERLALU BESAR*\n\n` +
                                  `Size: ${(parseInt(res.audio.size) / (1024 * 1024)).toFixed(2)} MB\n` +
                                  `Maksimal: 50 MB\n\n` +
                                  `🔗 Download manual:\n${audioUrl}`
                        })
                        return
                    }
                    
                    await sock.sendMessage(from, { text: '📥 *Mendownload audio...*' })
                    
                    try {
                        const audioBuffer = await downloadWithRetry(audioUrl)
                        
                        // Send audio
                        await sock.sendMessage(from, {
                            audio: audioBuffer,
                            mimetype: 'audio/mpeg',
                            fileName: `${res.title}.mp3`,
                            ptt: false
                        })
                        
                        // Deduct limit on success
                        if (user && !user.premium) {
                            context.db.updateUser(sender, {
                                limit: user.limit - 3
                            })
                        }
                        
                        // Send success message
                        await sock.sendMessage(from, {
                            text: `✅ *DOWNLOAD BERHASIL*\n\n` +
                                  `📝 Judul: ${res.title}\n` +
                                  `⏱️ Durasi: ${duration}\n` +
                                  `🎧 Kualitas: ${res.audio?.quality || 'Standard'}\n` +
                                  `💾 Size: ${res.audio?.size ? (parseInt(res.audio.size) / (1024 * 1024)).toFixed(2) + ' MB' : 'Unknown'}\n\n` +
                                  `🙏 Terima kasih sudah menggunakan bot!`
                        })
                        
                    } catch (downloadError) {
                        console.error('Error downloading audio:', downloadError)
                        
                        await sock.sendMessage(from, {
                            text: `⚠️ *DOWNLOAD GAGAL*\n\n` +
                                  `Judul: ${res.title}\n` +
                                  `Error: ${downloadError.message}\n\n` +
                                  `🔗 Download manual:\n${audioUrl}\n\n` +
                                  `_Link mungkin expired dalam beberapa menit_`
                        })
                    }
                    
                } catch (error) {
                    console.error('Error in play command:', error)
                    
                    await sock.sendMessage(from, {
                        text: `❌ *GAGAL MEMPROSES*\n\n` +
                              `Error: ${error.message}\n\n` +
                              `Silakan coba lagi nanti atau gunakan lagu lain.`
                    })
                }
            }
        },
        {
            command: 'ytsearch',
            alias: ['yts', 'cariyt', 'ytcari'],
            permission: 0,
            category: 'downloader',
            description: 'Cari video di YouTube',
            usage: '.ytsearch [judul video]',
            
            handler: async (context, args) => {
                const { sock, from, sender, config } = context
                
                const query = args.join(' ')
                
                if (!query) {
                    await sock.sendMessage(from, {
                        text: `❌ *FORMAT SALAH*\n\n` +
                              `Format: ${config.prefix[0]}ytsearch [judul video]\n\n` +
                              `Contoh:\n` +
                              `${config.prefix[0]}ytsearch Tutorial Node JS`
                    })
                    return
                }
                
                await sock.sendMessage(from, {
                    text: `🔍 *MENCARI VIDEO...*\n\n` +
                          `Query: "${query}"\n\n` +
                          `_Mohon tunggu..._`
                })
                
                try {
                    const { data } = await axios.get(
                        `https://api.ikyyxd.my.id/search/ytplayv2?q=${encodeURIComponent(query)}`,
                        {
                            timeout: 30000
                        }
                    )
                    
                    if (!data.status || !data.result) {
                        await sock.sendMessage(from, {
                            text: '❌ Video tidak ditemukan'
                        })
                        return
                    }
                    
                    const res = data.result
                    const duration = formatDuration(res.duration || 0)
                    const views = formatViews(res.views)
                    
                    let resultText = `╭━━━━━━━━━━━━━━━┈➤\n` +
                                    `┃🔍 *HASIL PENCARIAN*\n` +
                                    `╰━━━━━━━━━━━━━━━┈➤\n\n` +
                                    `📝 *Judul:* ${res.title}\n` +
                                    `👤 *Channel:* ${res.channel || 'Unknown'}\n` +
                                    `⏱️ *Durasi:* ${duration}\n` +
                                    `👁️ *Views:* ${views}\n` +
                                    `🔗 *URL:* ${res.source}\n\n` +
                                    `💡 _Gunakan ${config.prefix[0]}play untuk download_`
                    
                    if (res.thumbnail) {
                        await sock.sendMessage(from, {
                            image: { url: res.thumbnail },
                            caption: resultText
                        })
                    } else {
                        await sock.sendMessage(from, { text: resultText })
                    }
                    
                } catch (error) {
                    console.error('Error in ytsearch:', error)
                    await sock.sendMessage(from, {
                        text: '❌ Gagal mencari video, coba lagi nanti'
                    })
                }
            }
        },
        {
            command: 'ytaudio',
            alias: ['yta', 'ytmp3', 'audiyt'],
            permission: 0,
            category: 'downloader',
            description: 'Download audio dari URL YouTube',
            usage: '.ytaudio [url youtube]',
            
            handler: async (context, args) => {
                const { sock, from, sender, config } = context
                
                const url = args[0]
                
                if (!url || !url.includes('youtube.com') && !url.includes('youtu.be')) {
                    await sock.sendMessage(from, {
                        text: `❌ *FORMAT SALAH*\n\n` +
                              `Format: ${config.prefix[0]}ytaudio [url youtube]\n\n` +
                              `Contoh:\n` +
                              `${config.prefix[0]}ytaudio https://youtube.com/watch?v=xxxxx\n` +
                              `${config.prefix[0]}ytaudio https://youtu.be/xxxxx`
                    })
                    return
                }
                
                // Check limit
                const user = context.db.getUser(sender)
                if (user && user.limit < 3 && !user.premium) {
                    await sock.sendMessage(from, {
                        text: `❌ *LIMIT TIDAK CUKUP*\n\n` +
                              `Dibutuhkan: 3 limit\n` +
                              `Sisa limit: ${user.limit}`
                    })
                    return
                }
                
                await sock.sendMessage(from, {
                    text: '🎵 *MENDOWNLOAD AUDIO...*\n\n' +
                          '_Mohon tunggu sebentar..._'
                })
                
                try {
                    const { data } = await axios.get(
                        `https://api.ikyyxd.my.id/search/ytplayv2?q=${encodeURIComponent(url)}`,
                        {
                            timeout: 30000
                        }
                    )
                    
                    if (!data.status || !data.result) {
                        await sock.sendMessage(from, {
                            text: '❌ Video tidak ditemukan'
                        })
                        return
                    }
                    
                    const res = data.result
                    const audioUrl = res.audio?.url || res.downloadUrl
                    
                    if (!audioUrl) {
                        await sock.sendMessage(from, {
                            text: '❌ Audio tidak tersedia untuk video ini'
                        })
                        return
                    }
                    
                    const audioBuffer = await downloadWithRetry(audioUrl)
                    
                    await sock.sendMessage(from, {
                        audio: audioBuffer,
                        mimetype: 'audio/mpeg',
                        fileName: `${res.title}.mp3`,
                        ptt: false
                    })
                    
                    if (user && !user.premium) {
                        context.db.updateUser(sender, {
                            limit: user.limit - 3
                        })
                    }
                    
                    await sock.sendMessage(from, {
                        text: `✅ *AUDIO BERHASIL DIDOWNLOAD*\n\n` +
                              `📝 Judul: ${res.title}\n` +
                              `⏱️ Durasi: ${formatDuration(res.duration || 0)}`
                    })
                    
                } catch (error) {
                    console.error('Error in ytaudio:', error)
                    await sock.sendMessage(from, {
                        text: '❌ Gagal mendownload audio, coba lagi nanti'
                    })
                }
            }
        },
        {
            command: 'ytvideo',
            alias: ['ytv', 'ytmp4', 'videoyt'],
            permission: 0,
            category: 'downloader',
            description: 'Download video dari YouTube',
            usage: '.ytvideo [url youtube]',
            
            handler: async (context, args) => {
                const { sock, from, sender, config } = context
                
                const url = args[0]
                
                if (!url || !url.includes('youtube.com') && !url.includes('youtu.be')) {
                    await sock.sendMessage(from, {
                        text: `❌ *FORMAT SALAH*\n\n` +
                              `Format: ${config.prefix[0]}ytvideo [url youtube]\n\n` +
                              `Contoh:\n` +
                              `${config.prefix[0]}ytvideo https://youtube.com/watch?v=xxxxx`
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
                    text: '🎬 *MENDOWNLOAD VIDEO...*\n\n' +
                          '_Video mungkin berukuran besar, mohon tunggu..._'
                })
                
                try {
                    const { data } = await axios.get(
                        `https://api.ikyyxd.my.id/search/ytplayv2?q=${encodeURIComponent(url)}`,
                        {
                            timeout: 30000
                        }
                    )
                    
                    if (!data.status || !data.result) {
                        await sock.sendMessage(from, {
                            text: '❌ Video tidak ditemukan'
                        })
                        return
                    }
                    
                    const res = data.result
                    
                    // Try to get video URL
                    const videoUrl = res.video?.url || res.downloadUrl || res.url
                    
                    if (!videoUrl) {
                        await sock.sendMessage(from, {
                            text: '❌ Video tidak tersedia untuk diunduh'
                        })
                        return
                    }
                    
                    await sock.sendMessage(from, { text: '📥 Mendownload video...' })
                    
                    try {
                        const videoBuffer = await downloadWithRetry(videoUrl)
                        
                        // Check if video is too large for WhatsApp (max 100MB)
                        if (videoBuffer.length > 100 * 1024 * 1024) {
                            await sock.sendMessage(from, {
                                text: `⚠️ *VIDEO TERLALU BESAR*\n\n` +
                                      `Size: ${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB\n` +
                                      `Maksimal: 100 MB\n\n` +
                                      `🔗 Download manual:\n${videoUrl}`
                            })
                            return
                        }
                        
                        await sock.sendMessage(from, {
                            video: videoBuffer,
                            mimetype: 'video/mp4',
                            fileName: `${res.title}.mp4`,
                            caption: `✅ ${res.title}`
                        })
                        
                        if (user && !user.premium) {
                            context.db.updateUser(sender, {
                                limit: user.limit - 5
                            })
                        }
                        
                    } catch (downloadError) {
                        await sock.sendMessage(from, {
                            text: `⚠️ *DOWNLOAD GAGAL*\n\n` +
                                  `Error: ${downloadError.message}\n\n` +
                                  `🔗 Download manual:\n${videoUrl}`
                        })
                    }
                    
                } catch (error) {
                    console.error('Error in ytvideo:', error)
                    await sock.sendMessage(from, {
                        text: '❌ Gagal mendownload video, coba lagi nanti'
                    })
                }
            }
        }
    ]
}
