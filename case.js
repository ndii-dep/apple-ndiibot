/* 
 * apple-ndiibot
 * created by ndii
 * © 2026
 */

const os = require('os')
const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const util = require('util')
const execPromise = util.promisify(exec)

// Permission levels
const PERMISSIONS = {
    PUBLIC: 0,
    USER: 1,
    PREMIUM: 2,
    PARTNER: 3,
    SELLER: 4,
    OWNER: 5
}

// Plugin Manager
class PluginManager {
    constructor() {
        this.pluginsDir = path.join(__dirname, 'plugins')
        this.plugins = new Map()
        this.loadPlugins()
    }

    loadPlugins() {
        if (!fs.existsSync(this.pluginsDir)) {
            fs.mkdirSync(this.pluginsDir, { recursive: true })
            console.log('📁 Created plugins directory')
        }

        const files = fs.readdirSync(this.pluginsDir)
        
        files.forEach(file => {
            if (file.endsWith('.js')) {
                try {
                    const pluginPath = path.join(this.pluginsDir, file)
                    delete require.cache[require.resolve(pluginPath)]
                    const plugin = require(pluginPath)
                    
                    if (plugin && plugin.name && plugin.commands) {
                        this.plugins.set(plugin.name, plugin)
                        console.log(`✅ Plugin loaded: ${plugin.name} (${plugin.commands.length} commands)`)
                    }
                } catch (error) {
                    console.error(`❌ Failed to load plugin ${file}:`, error.message)
                }
            }
        })
    }

    reloadPlugins() {
        this.plugins.clear()
        this.loadPlugins()
        return this.getPluginInfo()
    }

    getPluginInfo() {
        const info = []
        this.plugins.forEach((plugin, name) => {
            info.push({
                name: name,
                commands: plugin.commands,
                description: plugin.description || 'No description',
                version: plugin.version || '1.0.0',
                author: plugin.author || 'Unknown'
            })
        })
        return info
    }

    getPluginCommands() {
        const commands = new Map()
        this.plugins.forEach((plugin) => {
            plugin.commands.forEach(cmd => {
                commands.set(cmd.command, {
                    handler: cmd.handler,
                    permission: cmd.permission || PERMISSIONS.PUBLIC,
                    category: cmd.category || plugin.name,
                    description: cmd.description || 'No description'
                })
            })
        })
        return commands
    }

    executePluginCommand(command, context, args) {
        const pluginCommands = this.getPluginCommands()
        const cmd = pluginCommands.get(command)
        
        if (cmd) {
            return cmd.handler(context, args)
        }
        return null
    }
}

// Check permission
function checkPermission(requiredPermission, context) {
    const user = context.db.getUser(context.sender)
    const ownerData = context.db.load('owner.json')
    const partnerData = context.db.load('partner.json')
    
    const cleanSender = context.db.cleanJid(context.sender)
    const senderNumber = cleanSender.split('@')[0]
    
    // Check if owner
    const isOwner = ownerData.mainOwner.includes(senderNumber) || 
                    ownerData.additionalOwners.includes(senderNumber)
    
    // Check if partner
    const isPartner = partnerData[cleanSender]?.status === 'active'
    
    // Check if premium
    const isPremium = user?.premium === true
    
    // Check if seller (using premium level for now)
    const isSeller = user?.seller === true
    
    // Determine user permission level
    let userPermission = PERMISSIONS.PUBLIC
    if (user) userPermission = PERMISSIONS.USER
    if (isPremium) userPermission = PERMISSIONS.PREMIUM
    if (isPartner) userPermission = PERMISSIONS.PARTNER
    if (isSeller) userPermission = PERMISSIONS.SELLER
    if (isOwner) userPermission = PERMISSIONS.OWNER
    
    return userPermission >= requiredPermission
}

// Helper functions
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
}

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days} hari ${hours % 24} jam`
    if (hours > 0) return `${hours} jam ${minutes % 60} menit`
    if (minutes > 0) return `${minutes} menit ${seconds % 60} detik`
    return `${seconds} detik`
}

// Main case handler
async function caseHandler(command, context, args = []) {
    const pluginManager = new PluginManager()
    const { sock, from, sender, isGroup, pushName, msgType, content, message, db, config, startTime } = context
    
    // Try plugin commands first
    const pluginResult = pluginManager.executePluginCommand(command, context, args)
    if (pluginResult !== null) {
        return pluginResult
    }

    switch (command) {
        // ==================== GENERAL COMMANDS ====================
        case 'menu':
        case 'help':
        case 'start': {
            const categories = {}
            const user = db.getUser(sender)
            const ownerData = db.load('owner.json')
            const cleanSender = db.cleanJid(sender)
            const senderNumber = cleanSender.split('@')[0]
            
            // Check user type
            const isOwner = ownerData.mainOwner.includes(senderNumber) || 
                           ownerData.additionalOwners.includes(senderNumber)
            const isPremium = user?.premium === true
            const isPartner = db.load('partner.json')[cleanSender]?.status === 'active'
            
            // Built-in commands metadata
            const builtinCommands = {
                menu: { permission: PERMISSIONS.PUBLIC, category: 'general', description: 'Menampilkan menu bot' },
                ping: { permission: PERMISSIONS.PUBLIC, category: 'general', description: 'Cek kecepatan bot' },
                runtime: { permission: PERMISSIONS.PUBLIC, category: 'general', description: 'Cek uptime bot' },
                profile: { permission: PERMISSIONS.PUBLIC, category: 'general', description: 'Lihat profil pengguna' },
                limit: { permission: PERMISSIONS.PUBLIC, category: 'general', description: 'Cek sisa limit' },
                saldo: { permission: PERMISSIONS.PUBLIC, category: 'general', description: 'Cek saldo' },
                plugins: { permission: PERMISSIONS.PUBLIC, category: 'general', description: 'Lihat daftar plugin' },
                owner: { permission: PERMISSIONS.PUBLIC, category: 'general', description: 'Info owner bot' },
                afk: { permission: PERMISSIONS.PUBLIC, category: 'tools', description: 'Mode AFK' },
                reminder: { permission: PERMISSIONS.PUBLIC, category: 'tools', description: 'Set reminder' },
                sticker: { permission: PERMISSIONS.PUBLIC, category: 'tools', description: 'Buat stiker dari gambar' },
                tagall: { permission: PERMISSIONS.USER, category: 'group', description: 'Tag semua member group' },
                addprem: { permission: PERMISSIONS.OWNER, category: 'owner', description: 'Tambah user premium' },
                delprem: { permission: PERMISSIONS.OWNER, category: 'owner', description: 'Hapus user premium' },
                addpartner: { permission: PERMISSIONS.OWNER, category: 'owner', description: 'Tambah partner' },
                delpartner: { permission: PERMISSIONS.OWNER, category: 'owner', description: 'Hapus partner' },
                broadcast: { permission: PERMISSIONS.OWNER, category: 'owner', description: 'Broadcast pesan ke semua user' },
                stats: { permission: PERMISSIONS.OWNER, category: 'owner', description: 'Statistik bot' },
                reloadplugins: { permission: PERMISSIONS.OWNER, category: 'owner', description: 'Reload plugins' },
            }
            
            // Add plugin commands to menu
            const pluginCommands = pluginManager.getPluginCommands()
            pluginCommands.forEach((cmd, cmdName) => {
                if (!builtinCommands[cmdName]) {
                    builtinCommands[cmdName] = {
                        permission: cmd.permission,
                        category: cmd.category,
                        description: cmd.description
                    }
                }
            })
            
            // Group commands by category and permission
            Object.entries(builtinCommands).forEach(([cmdName, meta]) => {
                if (checkPermission(meta.permission, context)) {
                    if (!categories[meta.category]) {
                        categories[meta.category] = []
                    }
                    categories[meta.category].push({
                        command: cmdName,
                        description: meta.description,
                        permission: meta.permission
                    })
                }
            })
            
            // Determine user status
            let userStatus = '👤 User'
            if (isOwner) userStatus = '👑 Owner'
            else if (isPartner) userStatus = '🤝 Partner'
            else if (isPremium) userStatus = '💎 Premium'
            
            let menuText = `╭━━━━━━━━━━━━━━━┈➤\n` +
                          `┃🤖 *${config.botName}*\n` +
                          `┃Version: ${config.version}\n` +
                          `┃User: @${senderNumber}\n` +
                          `┃Status: ${userStatus}\n` +
                          `┃Limit: ${user?.limit || 0}\n` +
                          `┃Saldo: Rp ${user?.balance || 0}\n` +
                          `╰━━━━━━━━━━━━━━━┈➤\n\n`
            
            // Add categories
            Object.entries(categories).forEach(([category, commands]) => {
                menuText += `╭───『 ${category.toUpperCase()} 』───┈➤\n`
                commands.forEach(cmd => {
                    menuText += `┃ ${config.prefix[0]}${cmd.command} - ${cmd.description}\n`
                })
                menuText += `╰━━━━━━━━━━━━━━━┈➤\n\n`
            })
            
            const totalCommands = Object.keys(builtinCommands).length
            menuText += `_Total: ${totalCommands} commands | ${pluginManager.plugins.size} plugins_`
            
            await sock.sendMessage(from, {
                text: menuText,
                mentions: [sender]
            })
        }
        break

        // ==================== INFO COMMANDS ====================
        case 'ping': {
            const start = Date.now()
            await sock.sendMessage(from, { text: '🏓 _Pong!_', mentions: [sender] })
            const latency = Date.now() - start
            
            const pingEmoji = latency < 100 ? '🟢' : latency < 300 ? '🟡' : '🔴'
            
            await sock.sendMessage(from, {
                text: `${pingEmoji} *PING RESULT*\n\n` +
                      `⚡ Speed: ${latency}ms\n` +
                      `📊 Status: Online\n` +
                      `🕒 Time: ${new Date().toLocaleString('id-ID')}\n` +
                      `💻 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
            })
        }
        break

        case 'runtime':
        case 'uptime': {
            const uptime = formatUptime(Date.now() - startTime)
            const processUptime = formatUptime(process.uptime() * 1000)
            
            await sock.sendMessage(from, {
                text: `⏰ *BOT RUNTIME*\n\n` +
                      `🤖 Bot: ${uptime}\n` +
                      `⚙️ Process: ${processUptime}\n` +
                      `📅 Started: ${new Date(startTime).toLocaleString('id-ID')}`
            })
        }
        break

        case 'profile':
        case 'me': {
            const user = db.getUser(sender)
            if (!user) {
                await sock.sendMessage(from, { text: '❌ Data user tidak ditemukan' })
                break
            }
            
            const cleanSender = db.cleanJid(sender)
            const senderNumber = cleanSender.split('@')[0]
            
            let profileText = `╭━━━━━━━━━━━━━━━┈➤\n` +
                             `┃👤 *PROFILE USER*\n` +
                             `╰━━━━━━━━━━━━━━━┈➤\n\n` +
                             `📱 Number: @${senderNumber}\n` +
                             `📝 Name: ${user.name || pushName || 'Unknown'}\n` +
                             `💎 Premium: ${user.premium ? '✅' : '❌'}\n` +
                             `🤝 Partner: ${user.partner ? '✅' : '❌'}\n` +
                             `🎯 Limit: ${user.limit}\n` +
                             `💰 Balance: Rp ${user.balance}\n` +
                             `📊 Total Commands: ${user.commandUsed || 0}\n` +
                             `📅 First Seen: ${new Date(user.firstSeen).toLocaleString('id-ID')}\n` +
                             `🕒 Last Seen: ${new Date(user.lastSeen).toLocaleString('id-ID')}`
            
            await sock.sendMessage(from, {
                text: profileText,
                mentions: [sender]
            })
        }
        break

        case 'limit': {
            const user = db.getUser(sender)
            if (!user) {
                await sock.sendMessage(from, { text: '❌ User tidak ditemukan' })
                break
            }
            
            const limitEmoji = user.limit > 10 ? '🟢' : user.limit > 0 ? '🟡' : '🔴'
            
            await sock.sendMessage(from, {
                text: `${limitEmoji} *LIMIT INFO*\n\n` +
                      `Sisa limit: ${user.limit}\n` +
                      `Total commands: ${user.commandUsed || 0}\n\n` +
                      `_Limit reset setiap hari_`
            })
        }
        break

        case 'saldo':
        case 'balance':
        case 'uang': {
            const user = db.getUser(sender)
            if (!user) {
                await sock.sendMessage(from, { text: '❌ User tidak ditemukan' })
                break
            }
            
            await sock.sendMessage(from, {
                text: `💰 *BALANCE INFO*\n\n` +
                      `Saldo: Rp ${user.balance}\n` +
                      `Total transaksi: ${user.totalTransactions || 0}\n\n` +
                      `_Gunakan .topup untuk menambah saldo_`
            })
        }
        break

        case 'owner':
        case 'creator':
        case 'developer': {
            const ownerData = db.load('owner.json')
            const cleanSender = db.cleanJid(sender)
            const senderNumber = cleanSender.split('@')[0]
            
            const isOwner = ownerData.mainOwner.includes(senderNumber) || 
                           ownerData.additionalOwners.includes(senderNumber)
            
            let ownerText = `╭━━━━━━━━━━━━━━━┈➤\n` +
                           `┃👑 *OWNER BOT*\n` +
                           `╰━━━━━━━━━━━━━━━┈➤\n\n` +
                           `🤖 Bot: ${config.botName}\n` +
                           `📱 Main Owner: @${ownerData.mainOwner[0]}\n`
            
            if (ownerData.additionalOwners.length > 0) {
                ownerText += `👥 Additional Owners:\n`
                ownerData.additionalOwners.forEach(owner => {
                    ownerText += `  - @${owner}\n`
                })
            }
            
            ownerText += `\n📊 Status: ${isOwner ? '✅ Anda Owner' : '❌ Anda bukan Owner'}`
            
            const mentions = [
                `${ownerData.mainOwner[0]}@s.whatsapp.net`,
                ...ownerData.additionalOwners.map(owner => `${owner}@s.whatsapp.net`)
            ]
            
            await sock.sendMessage(from, {
                text: ownerText,
                mentions: mentions
            })
        }
        break

        case 'plugins':
        case 'plugin': {
            const pluginsInfo = pluginManager.getPluginInfo()
            
            if (pluginsInfo.length === 0) {
                await sock.sendMessage(from, {
                    text: `📦 *PLUGINS INFO*\n\n` +
                          `Tidak ada plugin terinstall.\n` +
                          `Total: 0 plugins\n\n` +
                          `_Tambahkan plugin di folder 'plugins/'_`
                })
                break
            }
            
            let pluginsText = `╭━━━━━━━━━━━━━━━┈➤\n` +
                             `┃📦 *PLUGINS LIST*\n` +
                             `╰━━━━━━━━━━━━━━━┈➤\n\n` +
                             `📊 Total: ${pluginsInfo.length} plugins\n\n`
            
            pluginsInfo.forEach((plugin, index) => {
                pluginsText += `${index + 1}. *${plugin.name}* v${plugin.version}\n` +
                              `   📝 ${plugin.description}\n` +
                              `   👤 ${plugin.author}\n` +
                              `   ⚡ Commands: ${plugin.commands.length}\n\n`
            })
            
            pluginsText += `╭━━━━━━━━━━━━━━━┈➤\n` +
                          `┃ *DAFTAR PLUGIN COMMANDS:*\n` +
                          `╰━━━━━━━━━━━━━━━┈➤\n`
            
            pluginsInfo.forEach(plugin => {
                plugin.commands.forEach(cmd => {
                    pluginsText += `• ${config.prefix[0]}${cmd.command} - ${cmd.description}\n`
                })
            })
            
            await sock.sendMessage(from, { text: pluginsText })
        }
        break

        // ==================== TOOLS COMMANDS ====================
        case 'afk': {
            const reason = args.join(' ') || 'Sekarang lagi AFK'
            const user = db.getUser(sender)
            const timestamp = new Date().toISOString()
            
            if (user) {
                db.updateUser(sender, {
                    afk: {
                        status: true,
                        reason: reason,
                        timestamp: timestamp
                    }
                })
            }
            
            const cleanSender = db.cleanJid(sender)
            const senderNumber = cleanSender.split('@')[0]
            
            await sock.sendMessage(from, {
                text: `✅ *AFK MODE AKTIF*\n\n` +
                      `👤 User: @${senderNumber}\n` +
                      `📝 Reason: ${reason}\n` +
                      `🕒 Time: ${new Date(timestamp).toLocaleString('id-ID')}\n\n` +
                      `_Bot akan memberitahu orang yang mention Anda_`,
                mentions: [sender]
            })
        }
        break

        case 'reminder':
        case 'remind':
        case 'ingatkan': {
            if (args.length < 2) {
                await sock.sendMessage(from, {
                    text: `❌ *FORMAT SALAH*\n\n` +
                          `Format: ${config.prefix[0]}reminder [waktu] [pesan]\n\n` +
                          `Contoh:\n` +
                          `${config.prefix[0]}reminder 5menit Makan siang\n` +
                          `${config.prefix[0]}reminder 2jam Meeting penting\n` +
                          `${config.prefix[0]}reminder 1hari Bayar tagihan\n\n` +
                          `Format waktu: 5detik, 10menit, 2jam, 3hari`
                })
                break
            }
            
            const timeArg = args[0].toLowerCase()
            const reminderMessage = args.slice(1).join(' ')
            
            let executeAt = new Date()
            const timeMatch = timeArg.match(/(\d+)(detik|menit|jam|hari|minggu)/)
            
            if (!timeMatch) {
                await sock.sendMessage(from, { text: '❌ Format waktu tidak valid' })
                break
            }
            
            const value = parseInt(timeMatch[1])
            const unit = timeMatch[2]
            
            switch(unit) {
                case 'detik': executeAt.setSeconds(executeAt.getSeconds() + value); break
                case 'menit': executeAt.setMinutes(executeAt.getMinutes() + value); break
                case 'jam': executeAt.setHours(executeAt.getHours() + value); break
                case 'hari': executeAt.setDate(executeAt.getDate() + value); break
                case 'minggu': executeAt.setDate(executeAt.getDate() + (value * 7)); break
            }
            
            const reminder = db.addReminder({
                user: sender,
                message: reminderMessage,
                executeAt: executeAt.toISOString(),
                repeat: false
            })
            
            await sock.sendMessage(from, {
                text: `✅ *REMINDER DISET*\n\n` +
                      `⏰ Waktu: ${executeAt.toLocaleString('id-ID')}\n` +
                      `📝 Pesan: ${reminderMessage}\n` +
                      `🆔 ID: ${reminder.id}\n\n` +
                      `_Bot akan mengingatkan Anda tepat waktu_`
            })
        }
        break

        case 'sticker':
        case 'stiker':
        case 's': {
            if (msgType !== 'image' && msgType !== 'video') {
                await sock.sendMessage(from, {
                    text: `❌ *BUAT STICKER*\n\n` +
                          `Kirim gambar/video dengan caption:\n` +
                          `${config.prefix[0]}sticker\n\n` +
                          `Atau reply gambar dengan ${config.prefix[0]}sticker`
                })
                break
            }
            
            try {
                await sock.sendMessage(from, { text: '🔄 Membuat sticker...' })
                
                const buffer = await sock.downloadMediaMessage(message)
                
                if (!buffer) {
                    await sock.sendMessage(from, { text: '❌ Gagal download media' })
                    break
                }
                
                await sock.sendMessage(from, {
                    sticker: buffer,
                    mimetype: 'image/webp'
                })
                
                await sock.sendMessage(from, { text: '✅ Sticker berhasil dibuat!' })
            } catch (error) {
                console.error('Error creating sticker:', error)
                await sock.sendMessage(from, { text: '❌ Gagal membuat sticker' })
            }
        }
        break

        // ==================== GROUP COMMANDS ====================
        case 'tagall':
        case 'everyone':
        case 'tagallmember': {
            if (!isGroup) {
                await sock.sendMessage(from, { text: '❌ Command ini hanya untuk group' })
                break
            }
            
            if (!checkPermission(PERMISSIONS.USER, context)) {
                await sock.sendMessage(from, { text: '❌ Anda tidak memiliki akses' })
                break
            }
            
            try {
                const groupMetadata = await sock.groupMetadata(from)
                const participants = groupMetadata.participants
                const tagMessage = args.join(' ') || 'Attention all members!'
                
                let mentions = []
                let tagText = `📢 *TAG ALL MEMBERS*\n\n` +
                             `${tagMessage}\n\n`
                
                participants.forEach((participant, index) => {
                    mentions.push(participant.id)
                    tagText += `@${participant.id.split('@')[0]} `
                    if ((index + 1) % 5 === 0) tagText += '\n'
                })
                
                await sock.sendMessage(from, {
                    text: tagText,
                    mentions: mentions
                })
            } catch (error) {
                console.error('Error in tagall:', error)
                await sock.sendMessage(from, { text: '❌ Gagal mendapatkan member group' })
            }
        }
        break

        // ==================== OWNER COMMANDS ====================
        case 'addprem':
        case 'addpremium': {
            if (!checkPermission(PERMISSIONS.OWNER, context)) {
                await sock.sendMessage(from, { text: '❌ Khusus Owner!' })
                break
            }
            
            if (!args[0]) {
                await sock.sendMessage(from, {
                    text: `❌ Format: ${config.prefix[0]}addprem [nomor]\n` +
                          `Contoh: ${config.prefix[0]}addprem 6281234567890`
                })
                break
            }
            
            const targetNumber = args[0].replace(/[^0-9]/g, '')
            const targetJid = `${targetNumber}@s.whatsapp.net`
            
            const user = db.getUser(targetJid)
            if (!user) {
                await sock.sendMessage(from, { text: `❌ User @${targetNumber} belum terdaftar`, mentions: [targetJid] })
                break
            }
            
            db.updateUser(targetJid, { 
                premium: true,
                premiumSince: new Date().toISOString()
            })
            
            await sock.sendMessage(from, {
                text: `✅ *PREMIUM DITAMBAHKAN*\n\n` +
                      `👤 User: @${targetNumber}\n` +
                      `💎 Status: Premium\n` +
                      `📅 Sejak: ${new Date().toLocaleString('id-ID')}`,
                mentions: [targetJid]
            })
            
            // Notify user
            try {
                await sock.sendMessage(targetJid, {
                    text: `🎉 *SELAMAT!*\n\n` +
                          `Anda telah diupgrade ke Premium!\n` +
                          `Nikmati semua fitur premium.`
                })
            } catch (error) {}
        }
        break

        case 'delprem':
        case 'delpremium': {
            if (!checkPermission(PERMISSIONS.OWNER, context)) {
                await sock.sendMessage(from, { text: '❌ Khusus Owner!' })
                break
            }
            
            if (!args[0]) {
                await sock.sendMessage(from, {
                    text: `❌ Format: ${config.prefix[0]}delprem [nomor]\n` +
                          `Contoh: ${config.prefix[0]}delprem 6281234567890`
                })
                break
            }
            
            const targetNumber = args[0].replace(/[^0-9]/g, '')
            const targetJid = `${targetNumber}@s.whatsapp.net`
            
            db.updateUser(targetJid, { 
                premium: false,
                premiumExpired: new Date().toISOString()
            })
            
            await sock.sendMessage(from, {
                text: `✅ *PREMIUM DIHAPUS*\n\n` +
                      `👤 User: @${targetNumber}\n` +
                      `💎 Status: Non-Premium`,
                mentions: [targetJid]
            })
        }
        break

        case 'addpartner': {
            if (!checkPermission(PERMISSIONS.OWNER, context)) {
                await sock.sendMessage(from, { text: '❌ Khusus Owner!' })
                break
            }
            
            if (!args[0]) {
                await sock.sendMessage(from, {
                    text: `❌ Format: ${config.prefix[0]}addpartner [nomor]\n` +
                          `Contoh: ${config.prefix[0]}addpartner 6281234567890`
                })
                break
            }
            
            const targetNumber = args[0].replace(/[^0-9]/g, '')
            const targetJid = `${targetNumber}@s.whatsapp.net`
            
            const partners = db.load('partner.json')
            partners[targetJid] = {
                jid: targetJid,
                status: 'active',
                startDate: new Date().toISOString(),
                features: ['premium', 'partner'],
                metadata: {
                    addedBy: sender,
                    addedAt: new Date().toISOString()
                }
            }
            db.save('partner.json', partners)
            
            await sock.sendMessage(from, {
                text: `✅ *PARTNER DITAMBAHKAN*\n\n` +
                      `👤 User: @${targetNumber}\n` +
                      `🤝 Status: Partner Aktif\n` +
                      `📅 Sejak: ${new Date().toLocaleString('id-ID')}`,
                mentions: [targetJid]
            })
            
            // Notify user
            try {
                await sock.sendMessage(targetJid, {
                    text: `🎉 *SELAMAT!*\n\n` +
                          `Anda telah menjadi Partner Resmi!\n` +
                          `Nikmati semua fitur partner.`
                })
            } catch (error) {}
        }
        break

        case 'delpartner': {
            if (!checkPermission(PERMISSIONS.OWNER, context)) {
                await sock.sendMessage(from, { text: '❌ Khusus Owner!' })
                break
            }
            
            if (!args[0]) {
                await sock.sendMessage(from, {
                    text: `❌ Format: ${config.prefix[0]}delpartner [nomor]\n` +
                          `Contoh: ${config.prefix[0]}delpartner 6281234567890`
                })
                break
            }
            
            const targetNumber = args[0].replace(/[^0-9]/g, '')
            const targetJid = `${targetNumber}@s.whatsapp.net`
            
            const partners = db.load('partner.json')
            delete partners[targetJid]
            db.save('partner.json', partners)
            
            await sock.sendMessage(from, {
                text: `✅ *PARTNER DIHAPUS*\n\n` +
                      `👤 User: @${targetNumber}\n` +
                      `🤝 Status: Non-Partner`,
                mentions: [targetJid]
            })
        }
        break

        case 'broadcast':
        case 'bc':
        case 'siaran': {
            if (!checkPermission(PERMISSIONS.OWNER, context)) {
                await sock.sendMessage(from, { text: '❌ Khusus Owner!' })
                break
            }
            
            if (!args.length) {
                await sock.sendMessage(from, {
                    text: `❌ Format: ${config.prefix[0]}broadcast [pesan]\n` +
                          `Contoh: ${config.prefix[0]}broadcast Update bot tersedia!`
                })
                break
            }
            
            const broadcastMessage = args.join(' ')
            const users = db.load('users.json')
            let sent = 0
            let failed = 0
            
            await sock.sendMessage(from, { text: `📤 Memulai broadcast ke ${Object.keys(users).length} users...` })
            
            for (const userJid of Object.keys(users)) {
                try {
                    await sock.sendMessage(userJid, {
                        text: `📢 *BROADCAST*\n\n${broadcastMessage}\n\n` +
                              `_Dikirim oleh Owner ${config.botName}_`
                    })
                    sent++
                    
                    // Delay to avoid rate limit
                    await new Promise(resolve => setTimeout(resolve, 1000))
                } catch (error) {
                    failed++
                    console.error(`Failed to send to ${userJid}:`, error)
                }
            }
            
            await sock.sendMessage(from, {
                text: `✅ *BROADCAST SELESAI*\n\n` +
                      `📤 Terkirim: ${sent} users\n` +
                      `❌ Gagal: ${failed} users`
            })
        }
        break

        case 'stats':
        case 'statistik': {
            if (!checkPermission(PERMISSIONS.OWNER, context)) {
                await sock.sendMessage(from, { text: '❌ Khusus Owner!' })
                break
            }
            
            const stats = db.getDatabaseStats()
            const pluginsInfo = pluginManager.getPluginInfo()
            const uptime = formatUptime(Date.now() - startTime)
            const memoryUsage = process.memoryUsage()
            
            const statsText = `╭━━━━━━━━━━━━━━━┈➤\n` +
                             `┃📊 *BOT STATISTICS*\n` +
                             `╰━━━━━━━━━━━━━━━┈➤\n\n` +
                             `👥 Users: ${stats.totalUsers}\n` +
                             `💎 Premium: ${stats.totalPremium}\n` +
                             `🤝 Partners: ${stats.totalPartners}\n` +
                             `⏰ Reminders: ${stats.totalReminders}\n` +
                             `📦 Plugins: ${pluginsInfo.length}\n\n` +
                             `⚡ *System:*\n` +
                             `  • Uptime: ${uptime}\n` +
                             `  • Memory: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB/${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB\n` +
                             `  • CPU: ${os.cpus().length} cores\n` +
                             `  • OS: ${os.platform()} ${os.arch()}\n` +
                             `  • Node: ${process.version}\n` +
                             `  • Database: ${Math.round(stats.databaseSize / 1024)}KB`
            
            await sock.sendMessage(from, { text: statsText })
        }
        break

        case 'reloadplugins':
        case 'reloadplugin':
        case 'rplugin': {
            if (!checkPermission(PERMISSIONS.OWNER, context)) {
                await sock.sendMessage(from, { text: '❌ Khusus Owner!' })
                break
            }
            
            await sock.sendMessage(from, { text: '🔄 Reloading plugins...' })
            
            const pluginInfo = pluginManager.reloadPlugins()
            
            await sock.sendMessage(from, {
                text: `✅ *PLUGINS RELOADED*\n\n` +
                      `📦 Total: ${pluginInfo.length} plugins\n\n` +
                      pluginInfo.map(p => `• ${p.name} - ${p.commands.length} commands`).join('\n')
            })
        }
        break

        default: {
            // Unknown command
            await sock.sendMessage(from, {
                text: `❌ *COMMAND TIDAK DITEMUKAN*\n\n` +
                      `Command: ${config.prefix[0]}${command}\n\n` +
                      `Ketik ${config.prefix[0]}menu untuk melihat daftar command`
            })
        }
    }
}

module.exports = caseHandler
module.exports.PERMISSIONS = PERMISSIONS
module.exports.PluginManager = PluginManager
module.exports.checkPermission = checkPermission
