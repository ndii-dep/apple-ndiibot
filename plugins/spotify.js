/* 
 * apple-ndiibot
 * created by ndii
 * © 2026
 */

const https = require('https')
const axios = require('axios')
const { URL } = require('url')

class SoundloadersScraper {
    constructor() {
        this.cfApiUrl = 'https://api.ikyyxd.my.id/bypass/turnstile-cf-min'
        this.turnstileSiteKey = '0x4AAAAAADdgLDfT5kFRbt_5'
        this.targetUrl = 'https://soundloaders.app'
        this.userAgent = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36'
        this.cookies = new Map()
    }

    _log(...args) { 
        console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...args) 
    }

    _parseCookies(headers) {
        const setCookies = headers['set-cookie']
        if (!setCookies) return
        ;(Array.isArray(setCookies) ? setCookies : [setCookies]).forEach(cookieStr => {
            const [nameValue] = cookieStr.split(';')
            const [name, ...rest] = nameValue.split('=')
            if (name) this.cookies.set(name.trim(), rest.join('=').trim())
        })
    }

    _getCookieString() {
        return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
    }

    async solveTurnstile(targetPageUrl) {
        this._log('🛡️ [CF] Bypass Turnstile via API...')
        const apiUrl = new URL(this.cfApiUrl)
        apiUrl.searchParams.append('url', targetPageUrl)
        apiUrl.searchParams.append('sitekey', this.turnstileSiteKey)

        return new Promise((resolve, reject) => {
            const req = https.request(apiUrl, {
                method: 'GET', 
                timeout: 60000,
                headers: { 
                    'Accept': 'application/json', 
                    'User-Agent': this.userAgent 
                }
            }, (res) => {
                let data = ''
                res.on('data', chunk => data += chunk)
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data)
                        if (json.status && json.result && json.result.token) {
                            resolve(json.result.token)
                        } else { 
                            reject(new Error(`CF API Error: ${JSON.stringify(json)}`)) 
                        }
                    } catch (e) { 
                        reject(new Error(`CF Parse Error: ${e.message}`)) 
                    }
                })
            })
            req.on('error', reject)
            req.on('timeout', () => { 
                req.destroy() 
                reject(new Error('CF Timeout')) 
            })
            req.end()
        })
    }

    _makeRequest(options, postData = null) {
        return new Promise((resolve, reject) => {
            if (this.cookies.size > 0) options.headers['Cookie'] = this._getCookieString()

            const req = https.request(options, (res) => {
                this._parseCookies(res.headers)
                let body = ''
                res.on('data', chunk => body += chunk)
                res.on('end', () => resolve({ 
                    status: res.statusCode, 
                    body, 
                    headers: res.headers 
                }))
            })
            req.on('error', reject)
            if (postData) req.write(postData)
            req.end()
        })
    }

    async step1_GetPreview(spotifyUrl, cfToken) {
        this._log('🚀 [Step 1] Fetching track info...')
        const payload = new URLSearchParams()
        payload.append('url', spotifyUrl)
        payload.append('cftoken', cfToken)

        const options = {
            hostname: 'soundloaders.app', 
            path: '/action', 
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(payload.toString()),
                'User-Agent': this.userAgent,
                'Referer': this.targetUrl + '/',
                'Origin': this.targetUrl
            }
        }

        const res = await this._makeRequest(options, payload.toString())
        if (res.status !== 200) throw new Error(`Step 1 HTTP ${res.status}`)
        
        const json = JSON.parse(res.body)
        if (!json.status || !json.html) throw new Error('Invalid Step 1 Response')
        
        const html = json.html

        const tokenMatch = html.match(/<input[^>]+name=["']track_token["'][^>]+value=["']([^"']+)["']/i) ||
                           html.match(/track_token["']?\s*[:=]\s*["']([a-zA-Z0-9]+)["']/i)
        
        const dataMatch = html.match(/<input[^>]+name=["']data["'][^>]+value=["']([^"']+)["']/i) ||
                          html.match(/data["']?\s*[:=]\s*["']([A-Za-z0-9+/=]+)["']/i)

        if (!tokenMatch || !dataMatch) throw new Error('Failed to extract tokens from HTML')

        const titleMatch = html.match(/<h2[^>]*class="[^"]*font-bold[^"]*"[^>]*>([^<]+)<\/h2>/i) || 
                           html.match(/alt="([^"]+)"[^>]*class="[^"]*w-40/i)
        const artistMatch = html.match(/<p[^>]*class="[^"]*text-sm[^"]*"[^>]*>([^<]+)<\/p>/i)

        const title = titleMatch ? titleMatch[1].trim() : 'Unknown Title'
        const artist = artistMatch ? artistMatch[1].trim() : 'Unknown Artist'

        return { 
            trackToken: tokenMatch[1], 
            dataPayload: dataMatch[1], 
            title, 
            artist 
        }
    }

    async step2_GetDownloadLink(trackToken, dataPayload) {
        this._log('📥 [Step 2] Generating download link...')
        const payload = new URLSearchParams()
        payload.append('data', dataPayload)
        payload.append('track_token', trackToken)

        const options = {
            hostname: 'soundloaders.app', 
            path: '/action/tracks', 
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(payload.toString()),
                'User-Agent': this.userAgent,
                'Referer': this.targetUrl + '/action',
                'Origin': this.targetUrl,
                'Accept': 'application/json, text/javascript, */*; q=0.01'
            }
        }

        const res = await this._makeRequest(options, payload.toString())
        if (res.status !== 200) throw new Error(`Step 2 HTTP ${res.status}`)

        let content = res.body
        try {
            const json = JSON.parse(content)
            if (json.status === false) throw new Error(json.error || 'Server rejected request')
            if (json.url) return { mp3: json.url, cover: null }
            if (json.html) content = json.html
        } catch (e) {
            if (e.message.includes('Server rejected')) throw e
        }

        const mp3Match = content.match(/<a\s+id=["']popup["'][^>]+href=["']([^"']+)["'][^>]*>\s*Download Mp3/i)
        const coverMatch = content.match(/<a\s+id=["']popup["'][^>]+href=["']([^"']+)["'][^>]*>\s*Download Cover/i)

        const mp3Url = mp3Match ? mp3Match[1] : null
        const coverUrl = coverMatch ? coverMatch[1] : null

        if (!mp3Url) {
            const fallback = content.match(/href=["'](https:\/\/dl\.soundloaders\.app\/[^"']+)["']/i)
            if (fallback) return { mp3: fallback[1], cover: coverUrl }
            throw new Error('MP3 Link not found in final HTML')
        }

        return { mp3: mp3Url, cover: coverUrl }
    }

    async download(spotifyUrl) {
        try {
            const cfToken = await this.solveTurnstile(this.targetUrl)
            await new Promise(r => setTimeout(r, 800))
            
            const step1 = await this.step1_GetPreview(spotifyUrl, cfToken)
            await new Promise(r => setTimeout(r, 1200))
            
            const links = await this.step2_GetDownloadLink(step1.trackToken, step1.dataPayload)
            
            return {
                status: true,
                message: "Success",
                data: {
                    title: step1.title,
                    artist: step1.artist,
                    download_url: links.mp3,
                    cover_url: links.cover,
                    source: spotifyUrl,
                    timestamp: new Date().toISOString()
                }
            }

        } catch (error) {
            return {
                status: false,
                message: error.message,
                data: null,
                timestamp: new Date().toISOString()
            }
        }
    }
}

module.exports = {
    name: 'spotify-downloader',
    description: 'Download lagu dari Spotify',
    version: '1.0.0',
    author: 'ndii',
    
    commands: [
        {
            command: 'spotify',
            alias: ['spdl', 'spotifydl', 'musik'],
            permission: 0,
            category: 'downloader',
            description: 'Download lagu Spotify',
            
            handler: async (context, args) => {
                const { sock, from, sender, config } = context
                
                if (!args[0]) {
                    await sock.sendMessage(from, {
                        text: `❌ *FORMAT SALAH*\n\n` +
                              `Format: ${config.prefix[0]}spotify [url]\n\n` +
                              `Contoh:\n` +
                              `${config.prefix[0]}spotify https://open.spotify.com/track/xxxxx\n\n` +
                              `Mendukung:\n` +
                              `• Track Spotify\n` +
                              `• Album Spotify\n` +
                              `• Playlist Spotify`
                    })
                    return
                }
                
                const spotifyUrl = args[0]
                
                // Validate Spotify URL
                if (!spotifyUrl.includes('spotify.com') && !spotifyUrl.includes('spotify.link')) {
                    await sock.sendMessage(from, { 
                        text: '❌ URL tidak valid!\n\n' +
                              'Pastikan URL adalah link Spotify yang valid.'
                    })
                    return
                }
                
                // Check limit
                const user = context.db.getUser(sender)
                if (user && user.limit < 3 && !user.premium) {
                    await sock.sendMessage(from, { 
                        text: '❌ Limit tidak cukup!\n\n' +
                              'Dibutuhkan: 3 limit\n' +
                              `Sisa limit: ${user.limit}\n\n` +
                              'Upgrade ke premium untuk unlimited.'
                    })
                    return
                }
                
                await sock.sendMessage(from, { 
                    text: '🎵 *Memproses Spotify...*\n\n' +
                          '🔍 Mencari track...\n' +
                          '🛡️ Bypass Cloudflare...\n' +
                          '📥 Mendownload...\n\n' +
                          '_Proses ini mungkin memakan waktu 1-3 menit_'
                })
                
                const scraper = new SoundloadersScraper()
                const result = await scraper.download(spotifyUrl)
                
                if (result.status && result.data) {
                    try {
                        // Send cover image if available
                        if (result.data.cover_url) {
                            try {
                                const coverBuffer = await axios({
                                    method: 'GET',
                                    url: result.data.cover_url,
                                    responseType: 'arraybuffer'
                                })
                                
                                await sock.sendMessage(from, {
                                    image: Buffer.from(coverBuffer.data),
                                    caption: `🎵 *SPOTIFY DOWNLOADER*\n\n` +
                                            `📝 Title: ${result.data.title}\n` +
                                            `👤 Artist: ${result.data.artist}\n\n` +
                                            `⬇️ Mendownload audio...`
                                })
                            } catch (error) {
                                // Skip cover if failed
                            }
                        }
                        
                        // Download MP3
                        await sock.sendMessage(from, { text: '📥 Mendownload audio...' })
                        
                        const mp3Buffer = await axios({
                            method: 'GET',
                            url: result.data.download_url,
                            responseType: 'arraybuffer',
                            timeout: 60000
                        })
                        
                        // Send as audio
                        await sock.sendMessage(from, {
                            audio: Buffer.from(mp3Buffer.data),
                            mimetype: 'audio/mpeg',
                            fileName: `${result.data.artist} - ${result.data.title}.mp3`,
                            ptt: false
                        })
                        
                        // Deduct limit on success
                        if (user && !user.premium) {
                            context.db.updateUser(sender, {
                                limit: user.limit - 3
                            })
                        }
                        
                        // Send info
                        await sock.sendMessage(from, {
                            text: `✅ *DOWNLOAD BERHASIL*\n\n` +
                                  `📝 Title: ${result.data.title}\n` +
                                  `👤 Artist: ${result.data.artist}\n` +
                                  `⏰ Time: ${new Date().toLocaleString('id-ID')}`
                        })
                        
                    } catch (error) {
                        await sock.sendMessage(from, {
                            text: `✅ *TRACK DITEMUKAN*\n\n` +
                                  `📝 Title: ${result.data.title}\n` +
                                  `👤 Artist: ${result.data.artist}\n\n` +
                                  `🔗 Download URL:\n${result.data.download_url}\n\n` +
                                  `_URL mungkin expired dalam beberapa menit_`
                        })
                    }
                } else {
                    await sock.sendMessage(from, {
                        text: `❌ *DOWNLOAD GAGAL*\n\n` +
                              `Pesan: ${result.message || 'Terjadi kesalahan'}\n\n` +
                              `Silakan coba lagi atau gunakan link lain.`
                    })
                }
            }
        },
        {
            command: 'spotifysearch',
            alias: ['spsearch', 'carimusik'],
            permission: 0,
            category: 'downloader',
            description: 'Cari lagu di Spotify',
            
            handler: async (context, args) => {
                const { sock, from, config } = context
                
                if (!args.length) {
                    await sock.sendMessage(from, {
                        text: `❌ *FORMAT SALAH*\n\n` +
                              `Format: ${config.prefix[0]}spotifysearch [judul lagu]\n\n` +
                              `Contoh:\n` +
                              `${config.prefix[0]}spotifysearch Shape of You`
                    })
                    return
                }
                
                const query = args.join(' ')
                
                await sock.sendMessage(from, {
                    text: '🔍 *Mencari di Spotify...*\n\n' +
                          `Query: "${query}"\n\n` +
                          '_Fitur search akan segera hadir_'
                })
            }
        }
    ]
}
