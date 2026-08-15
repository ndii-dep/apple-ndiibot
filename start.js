/* 
 * apple-ndiibot
 * created by ndii
 * © 2026
 */

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    makeInMemoryStore
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const NodeCache = require('node-cache')
const os = require('os')
const caseHandler = require('./case')
const { PluginManager } = require('./case')

// ==================== CONFIGURATION ====================
const CONFIG = {
    sessionName: 'applendii-session',
    prefix: ['.', '#', '!', '/'],
    ownerNumber: ['6285800650661'], // GANTI dengan nomor owner
    botName: 'Apple-NDIIBot',
    version: '1.0.0',
    maxFileSize: 100 * 1024 * 1024, // 100MB
    autoRead: true,
    autoTyping: false,
    autoRecording: false,
    autoOnline: true,
    autoReplyUnknown: true,
    reminderCheckInterval: 10000, // 10 detik
    reconnectDelay: 5000, // 5 detik
    maxReconnectAttempts: 10,
}

// ==================== DATABASE MANAGER ====================
class DatabaseManager {
    constructor() {
        this.dbPath = path.join(__dirname, 'db')
        this.cache = new NodeCache({ stdTTL: 300 }) // Cache 5 menit
        this.ensureDatabase()
    }

    ensureDatabase() {
        // Buat folder db jika belum ada
        if (!fs.existsSync(this.dbPath)) {
            fs.mkdirSync(this.dbPath, { recursive: true })
            console.log('📁 Created database directory')
        }

        const files = ['owner.json', 'users.json', 'partner.json', 'reminder.json']
        files.forEach(file => {
            const filePath = path.join(this.dbPath, file)
            if (!fs.existsSync(filePath)) {
                const initialData = this.getInitialData(file)
                fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2))
                console.log(`📄 Created ${file}`)
            }
        })
    }

    getInitialData(filename) {
        switch(filename) {
            case 'owner.json':
                return {
                    mainOwner: CONFIG.ownerNumber,
                    additionalOwners: [],
                    botNumber: '',
                    config: {
                        autoread: CONFIG.autoRead,
                        autotyping: CONFIG.autoTyping,
                        autorecording: CONFIG.autoRecording,
                        prefix: CONFIG.prefix,
                        autoReplyUnknown: CONFIG.autoReplyUnknown
                    }
                }
            case 'users.json':
                return {}
            case 'partner.json':
                return {}
            case 'reminder.json':
                return []
            default:
                return {}
        }
    }

    load(filename) {
        const cacheKey = `db_${filename}`
        const cached = this.cache.get(cacheKey)
        if (cached) return cached

        try {
            const data = JSON.parse(fs.readFileSync(path.join(this.dbPath, filename), 'utf8'))
            this.cache.set(cacheKey, data)
            return data
        } catch (error) {
            console.error(`Error loading ${filename}:`, error)
            return this.getInitialData(filename)
        }
    }

    save(filename, data) {
        const cacheKey = `db_${filename}`
        this.cache.set(cacheKey, data)
        try {
            fs.writeFileSync(path.join(this.dbPath, filename), JSON.stringify(data, null, 2))
            return true
        } catch (error) {
            console.error(`Error saving ${filename}:`, error)
            return false
        }
    }

    cleanJid(jid) {
        return jid.replace(/:\d+@/, '@')
    }

    formatJid(number) {
        if (number.includes('@s.whatsapp.net')) return number
        const cleanNumber = number.replace(/[^0-9]/g, '')
        return `${cleanNumber}@s.whatsapp.net`
    }

    // ==================== USER MANAGEMENT ====================
    getUser(jid) {
        const users = this.load('users.json')
        const cleanJid = this.cleanJid(jid)
        return users[cleanJid] || null
    }

    saveUser(jid, userData) {
        const users = this.load('users.json')
        const cleanJid = this.cleanJid(jid)
        users[cleanJid] = userData
        this.save('users.json', users)
    }

    addUserIfNotExists(jid, name = '') {
        const cleanJid = this.cleanJid(jid)
        const user = this.getUser(cleanJid)
        
        if (!user) {
            const newUser = {
                jid: cleanJid,
                name: name,
                premium: false,
                seller: false,
                partner: false,
                limit: 20,
                balance: 0,
                commandUsed: 0,
                totalTransactions: 0,
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                afk: {
                    status: false,
                    reason: '',
                    timestamp: null
                },
                stats: {
                    totalCommands: 0,
                    totalPremiumCommands: 0,
                    totalOwnerCommands: 0,
                    totalGroupCommands: 0
                }
            }
            this.saveUser(cleanJid, newUser)
            return newUser
        }
        
        return user
    }

    updateUser(jid, updates) {
        const cleanJid = this.cleanJid(jid)
        const user = this.getUser(cleanJid)
        if (user) {
            const updatedUser = { 
                ...user, 
                ...updates, 
                lastSeen: new Date().toISOString() 
            }
            this.saveUser(cleanJid, updatedUser)
            return updatedUser
        }
        return null
    }

    getUserStats(jid) {
        const user = this.getUser(jid)
        if (!user) return null
        
        return {
            jid: user.jid,
            name: user.name,
            premium: user.premium,
            partner: user.partner,
            limit: user.limit,
            balance: user.balance,
            commandUsed: user.commandUsed,
            totalCommands: user.stats?.totalCommands || 0,
            firstSeen: user.firstSeen,
            lastSeen: user.lastSeen
        }
    }

    // ==================== PREMIUM MANAGEMENT ====================
    setPremium(jid, status = true) {
        const cleanJid = this.cleanJid(jid)
        const user = this.getUser(cleanJid)
        
        if (!user) {
            // Buat user baru jika belum ada
            this.addUserIfNotExists(cleanJid)
        }
        
        return this.updateUser(cleanJid, {
            premium: status,
            premiumSince: status ? new Date().toISOString() : null,
            premiumExpired: !status ? new Date().toISOString() : null
        })
    }

    getPremiumUsers() {
        const users = this.load('users.json')
        return Object.values(users).filter(user => user.premium === true)
    }

    // ==================== PARTNER MANAGEMENT ====================
    setPartner(jid, status = true) {
        const cleanJid = this.cleanJid(jid)
        const partners = this.load('partner.json')
        
        if (status) {
            partners[cleanJid] = {
                jid: cleanJid,
                status: 'active',
                startDate: new Date().toISOString(),
                features: ['premium', 'partner'],
                metadata: {
                    updatedAt: new Date().toISOString()
                }
            }
        } else {
            delete partners[cleanJid]
        }
        
        this.save('partner.json', partners)
        
        // Update user data
        this.updateUser(cleanJid, { partner: status })
        
        return partners[cleanJid] || null
    }

    getPartners() {
        const partners = this.load('partner.json')
        return Object.values(partners).filter(partner => partner.status === 'active')
    }

    // ==================== REMINDER MANAGEMENT ====================
    addReminder(reminderData) {
        const reminders = this.load('reminder.json')
        const newReminder = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            user: reminderData.user,
            message: reminderData.message,
            executeAt: reminderData.executeAt,
            status: 'pending',
            repeat: reminderData.repeat || false,
            repeatInterval: reminderData.repeatInterval || null,
            created_at: new Date().toISOString(),
            executed_at: null
        }
        reminders.push(newReminder)
        this.save('reminder.json', reminders)
        return newReminder
    }

    getPendingReminders() {
        const reminders = this.load('reminder.json')
        const now = new Date().getTime()
        return reminders.filter(r => 
            r.status === 'pending' && 
            new Date(r.executeAt).getTime() <= now
        )
    }

    updateReminderStatus(id, status) {
        const reminders = this.load('reminder.json')
        const reminder = reminders.find(r => r.id === id)
        
        if (reminder) {
            reminder.status = status
            reminder.executed_at = new Date().toISOString()
            
            // Handle repeat reminders
            if (reminder.repeat && status === 'executed') {
                const executeAt = new Date(reminder.executeAt)
                
                if (reminder.repeatInterval) {
                    switch(reminder.repeatInterval) {
                        case 'daily':
                            executeAt.setDate(executeAt.getDate() + 1)
                            break
                        case 'weekly':
                            executeAt.setDate(executeAt.getDate() + 7)
                            break
                        case 'monthly':
                            executeAt.setMonth(executeAt.getMonth() + 1)
                            break
                    }
                }
                
                reminder.executeAt = executeAt.toISOString()
                reminder.status = 'pending'
                reminder.executed_at = null
            }
            
            this.save('reminder.json', reminders)
            return reminder
        }
        return null
    }

    deleteReminder(id) {
        const reminders = this.load('reminder.json')
        const filteredReminders = reminders.filter(r => r.id !== id)
        this.save('reminder.json', filteredReminders)
        return filteredReminders.length !== reminders.length
    }

    getUserReminders(jid) {
        const reminders = this.load('reminder.json')
        const cleanJid = this.cleanJid(jid)
        return reminders.filter(r => r.user === cleanJid && r.status === 'pending')
    }

    // ==================== DATABASE STATS ====================
    getDatabaseStats() {
        const users = this.load('users.json')
        const partners = this.load('partner.json')
        const reminders = this.load('reminder.json')
        
        return {
            totalUsers: Object.keys(users).length,
            totalPartners: Object.keys(partners).length,
            totalReminders: reminders.length,
            totalPremium: Object.values(users).filter(u => u.premium).length,
            totalSeller: Object.values(users).filter(u => u.seller).length,
            databaseSize: this.getDirectorySize(this.dbPath),
            lastUpdated: new Date().toISOString()
        }
    }

    getDirectorySize(dirPath) {
        let size = 0
        try {
            const files = fs.readdirSync(dirPath)
            files.forEach(file => {
                const filePath = path.join(dirPath, file)
                const stats = fs.statSync(filePath)
                if (stats.isFile()) {
                    size += stats.size
                }
            })
        } catch (error) {
            console.error('Error calculating directory size:', error)
        }
        return size
    }

    // ==================== OWNER MANAGEMENT ====================
    isOwner(jid) {
        const ownerData = this.load('owner.json')
        const cleanJid = this.cleanJid(jid)
        const senderNumber = cleanJid.split('@')[0]
        
        return ownerData.mainOwner.includes(senderNumber) || 
               ownerData.additionalOwners.includes(senderNumber)
    }

    addOwner(number) {
        const ownerData = this.load('owner.json')
        const cleanNumber = number.replace(/[^0-9]/g, '')
        
        if (!ownerData.additionalOwners.includes(cleanNumber)) {
            ownerData.additionalOwners.push(cleanNumber)
            this.save('owner.json', ownerData)
            return true
        }
        return false
    }

    removeOwner(number) {
        const ownerData = this.load('owner.json')
        const cleanNumber = number.replace(/[^0-9]/g, '')
        
        const index = ownerData.additionalOwners.indexOf(cleanNumber)
        if (index > -1) {
            ownerData.additionalOwners.splice(index, 1)
            this.save('owner.json', ownerData)
            return true
        }
        return false
    }

    // ==================== CACHE MANAGEMENT ====================
    clearCache() {
        this.cache.flushAll()
        return true
    }

    getCacheStats() {
        return this.cache.getStats()
    }
}

// ==================== WHATSAPP BOT ====================
class WhatsAppBot {
    constructor() {
        this.db = new DatabaseManager()
        this.pluginManager = new PluginManager()
        this.sock = null
        this.pairingCode = null
        this.isConnected = false
        this.startTime = Date.now()
        this.messageCount = 0
        this.commandCount = 0
        this.reconnectAttempts = 0
        this.store = null
        this.reminderInterval = null
    }

    async start() {
        this.printBanner()
        await this.initializeStore()
        await this.connectToWhatsApp()
        this.startReminderEngine()
        this.startHealthCheck()
        this.setupGracefulShutdown()
    }

    printBanner() {
        console.log('=================================')
        console.log('     APPLE-NDIIBOT STARTING')
        console.log('=================================')
        console.log(`🤖 Bot Name: ${CONFIG.botName}`)
        console.log(`📌 Version: ${CONFIG.version}`)
        console.log(`👑 Owner: ${CONFIG.ownerNumber.join(', ')}`)
        console.log(`⚡ Prefix: ${CONFIG.prefix.join(' ')}`)
        console.log(`💾 Session: ${CONFIG.sessionName}`)
        console.log(`📦 Plugins: ${this.pluginManager.plugins.size} loaded`)
        console.log('=================================\n')
    }

    async initializeStore() {
        this.store = makeInMemoryStore({ 
            logger: pino({ level: 'silent' }) 
        })
        
        this.store.readFromFile(path.join(__dirname, 'store.json'))
        
        // Save store every 10 seconds
        setInterval(() => {
            this.store.writeToFile(path.join(__dirname, 'store.json'))
        }, 10000)
    }

    async connectToWhatsApp() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(CONFIG.sessionName)
            const { version, isLatest } = await fetchLatestBaileysVersion()
            
            console.log(`📱 WhatsApp Version: ${version.join('.')} (${isLatest ? 'Latest' : 'Update Available'})`)

            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
                },
                browser: Browsers.ubuntu('Chrome'),
                markOnlineOnConnect: CONFIG.autoOnline,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                getMessage: async (key) => {
                    // Implement message retrieval if needed
                    return { conversation: '' }
                }
            })

            // Bind store
            this.store.bind(this.sock.ev)

            // Handle credentials update
            this.sock.ev.on('creds.update', saveCreds)

            // Handle connection updates
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update

                if (qr) {
                    console.log('📱 QR Code received (using pairing code instead)')
                }

                if (connection === 'open') {
                    this.isConnected = true
                    this.reconnectAttempts = 0
                    console.log('✅ Connected to WhatsApp')
                    
                    // Update bot number in owner database
                    await this.updateBotInfo()
                    
                    // Send startup message to owner
                    await this.sendStartupMessage()
                }

                if (connection === 'close') {
                    this.isConnected = false
                    const statusCode = lastDisconnect?.error?.output?.statusCode
                    
                    console.log(`❌ Connection closed (Status: ${statusCode})`)
                    
                    await this.handleDisconnect(statusCode)
                }
            })

            // Handle message updates
            this.sock.ev.on('messages.upsert', async (m) => {
                await this.handleMessages(m)
            })

            // Handle group participants update
            this.sock.ev.on('group-participants.update', async (update) => {
                await this.handleGroupUpdate(update)
            })

            // Handle pairing if not registered
            if (!this.sock.authState.creds.registered) {
                await this.requestPairingCode()
            }

        } catch (error) {
            console.error('❌ Error connecting to WhatsApp:', error)
            console.log(`🔄 Reconnecting in ${CONFIG.reconnectDelay / 1000} seconds...`)
            setTimeout(() => this.connectToWhatsApp(), CONFIG.reconnectDelay)
        }
    }

    async handleDisconnect(statusCode) {
        if (this.reconnectAttempts >= CONFIG.maxReconnectAttempts) {
            console.log('❌ Max reconnect attempts reached. Please restart manually.')
            process.exit(1)
        }

        switch(statusCode) {
            case DisconnectReason.loggedOut:
                console.log('❌ Logged out. Need to re-pair.')
                await this.requestPairingCode()
                break
                
            case DisconnectReason.badSession:
                console.log('❌ Bad session. Re-pairing needed.')
                await this.requestPairingCode()
                break
                
            case DisconnectReason.connectionClosed:
                console.log('🔄 Connection closed. Reconnecting...')
                await this.reconnect()
                break
                
            case DisconnectReason.connectionLost:
                console.log('🔄 Connection lost. Reconnecting...')
                await this.reconnect()
                break
                
            case DisconnectReason.connectionReplaced:
                console.log('🔄 Connection replaced. Reconnecting...')
                await this.reconnect()
                break
                
            case DisconnectReason.timedOut:
                console.log('🔄 Connection timed out. Reconnecting...')
                await this.reconnect()
                break
                
            default:
                console.log('🔄 Unknown disconnect reason. Reconnecting...')
                await this.reconnect()
        }
    }

    async reconnect() {
        this.reconnectAttempts++
        console.log(`🔄 Reconnecting... (Attempt ${this.reconnectAttempts}/${CONFIG.maxReconnectAttempts})`)
        
        await new Promise(resolve => setTimeout(resolve, CONFIG.reconnectDelay))
        await this.connectToWhatsApp()
    }

    async requestPairingCode() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        rl.question('📱 Masukkan nomor WhatsApp untuk bot (contoh: 6281234567890): ', async (phoneNumber) => {
            rl.close()
            
            try {
                const formattedNumber = phoneNumber.replace(/[^0-9]/g, '')
                if (!formattedNumber || formattedNumber.length < 10) {
                    console.log('❌ Nomor tidak valid. Harap masukkan nomor yang benar.')
                    await this.requestPairingCode()
                    return
                }

                console.log('🔄 Generating pairing code...')
                const pairingCode = await this.sock.requestPairingCode(formattedNumber)
                
                console.log('\n=================================')
                console.log('     PAIRING CODE GENERATED')
                console.log('=================================')
                console.log(`📱 Code: ${pairingCode}`)
                console.log('=================================')
                console.log('Langkah pairing:')
                console.log('1. Buka WhatsApp di HP Anda')
                console.log('2. Klik menu (⋮) > Linked devices')
                console.log('3. Klik "Link a device"')
                console.log('4. Masukkan code di atas')
                console.log('=================================\n')
                
            } catch (error) {
                console.error('❌ Error generating pairing code:', error)
                await this.requestPairingCode()
            }
        })
    }

    async updateBotInfo() {
        try {
            const ownerData = this.db.load('owner.json')
            const botJid = this.sock.user.id
            const cleanBotJid = this.db.cleanJid(botJid)
            
            ownerData.botNumber = cleanBotJid
            this.db.save('owner.json', ownerData)
            
            console.log(`📱 Bot Number: ${cleanBotJid.split('@')[0]}`)
            
            // Set bot profile
            if (ownerData.config.autobio) {
                await this.sock.updateProfileStatus(`🤖 ${CONFIG.botName} v${CONFIG.version} | Aktif`)
            }
        } catch (error) {
            console.error('Error updating bot info:', error)
        }
    }

    async handleMessages(messages) {
        if (!messages.messages) return
        
        for (const message of messages.messages) {
            try {
                if (!message.message) continue
                if (message.key.fromMe) continue
                
                const msgType = this.getMessageType(message.message)
                const content = this.getMessageContent(message.message, msgType)
                const from = message.key.remoteJid
                const sender = message.key.participant || from
                const isGroup = from.endsWith('@g.us')
                const pushName = message.pushName || 'Unknown'
                const isBaileys = message.key.id?.startsWith('BAE5')
                
                this.messageCount++
                
                // Add user to database if not exists
                const user = this.db.addUserIfNotExists(sender, pushName)
                
                // Handle AFK detection
                await this.handleAfkDetection(from, sender, content, isGroup, pushName)
                
                // Auto typing if enabled
                const ownerData = this.db.load('owner.json')
                if (ownerData.config.autotyping && content) {
                    await this.sock.sendPresenceUpdate('composing', from)
                    await new Promise(resolve => setTimeout(resolve, 2000))
                    await this.sock.sendPresenceUpdate('paused', from)
                }
                
                // Parse command
                const prefix = this.detectPrefix(content)
                if (prefix) {
                    const commandText = content.slice(prefix.length).trim()
                    if (commandText) {
                        const [command, ...args] = commandText.split(' ')
                        this.commandCount++
                        
                        // Update user command count
                        const user = this.db.getUser(sender)
                        if (user) {
                            this.db.updateUser(sender, {
                                commandUsed: (user.commandUsed || 0) + 1,
                                stats: {
                                    ...user.stats,
                                    totalCommands: (user.stats?.totalCommands || 0) + 1,
                                    totalGroupCommands: isGroup ? (user.stats?.totalGroupCommands || 0) + 1 : user.stats?.totalGroupCommands || 0
                                }
                            })
                        }
                        
                        // Execute command
                        await this.executeCommand(command.toLowerCase(), args, {
                            sock: this.sock,
                            from,
                            sender,
                            isGroup,
                            pushName,
                            msgType,
                            content,
                            message,
                            db: this.db,
                            config: CONFIG,
                            startTime: this.startTime,
                            isBaileys
                        })
                    }
                }
                
                // Auto read if enabled
                if (ownerData.config.autoread) {
                    await this.sock.readMessages([message.key])
                }
                
            } catch (error) {
                console.error('Error handling message:', error)
            }
        }
    }

    async handleAfkDetection(from, sender, content, isGroup, pushName) {
        if (!isGroup || !content) return
        
        try {
            // Check if mentioned user is AFK
            const mentionedJids = content.match(/@(\d+)/g)
            if (mentionedJids) {
                for (const mention of mentionedJids) {
                    const mentionedNumber = mention.replace('@', '')
                    const mentionedJid = `${mentionedNumber}@s.whatsapp.net`
                    const mentionedUser = this.db.getUser(mentionedJid)
                    
                    if (mentionedUser?.afk?.status) {
                        const afkTime = mentionedUser.afk.timestamp
                        const afkDuration = this.formatDuration(new Date(afkTime).getTime())
                        
                        await this.sock.sendMessage(from, {
                            text: `💤 *USER SEDANG AFK*\n\n` +
                                  `@${mentionedNumber} sedang AFK sejak ${afkDuration} yang lalu\n` +
                                  `📝 Alasan: ${mentionedUser.afk.reason}\n\n` +
                                  `_Pesan Anda akan dibalas nanti_`,
                            mentions: [mentionedJid]
                        })
                    }
                }
            }
            
            // Check if sender is AFK and now active
            const senderUser = this.db.getUser(sender)
            if (senderUser?.afk?.status) {
                this.db.updateUser(sender, {
                    afk: {
                        status: false,
                        reason: '',
                        timestamp: null
                    }
                })
                
                await this.sock.sendMessage(from, {
                    text: `✅ @${sender.split('@')[0]} sudah kembali dari AFK`,
                    mentions: [sender]
                })
            }
        } catch (error) {
            console.error('Error handling AFK detection:', error)
        }
    }

    async handleGroupUpdate(update) {
        try {
            const { id, participants, action } = update
            
            if (action === 'add') {
                const groupMetadata = await this.sock.groupMetadata(id)
                const groupName = groupMetadata.subject
                
                for (const participant of participants) {
                    const welcomeMsg = `👋 *WELCOME*\n\n` +
                                      `Selamat datang @${participant.split('@')[0]}\n` +
                                      `di group *${groupName}*\n\n` +
                                      `Jangan lupa baca deskripsi group ya!`
                    
                    await this.sock.sendMessage(id, {
                        text: welcomeMsg,
                        mentions: [participant]
                    })
                }
            } else if (action === 'remove') {
                for (const participant of participants) {
                    const leaveMsg = `👋 *GOODBYE*\n\n` +
                                    `@${participant.split('@')[0]} telah meninggalkan group`
                    
                    await this.sock.sendMessage(id, {
                        text: leaveMsg,
                        mentions: [participant]
                    })
                }
            }
        } catch (error) {
            console.error('Error handling group update:', error)
        }
    }

    detectPrefix(content) {
        if (!content) return null
        for (const prefix of CONFIG.prefix) {
            if (content.startsWith(prefix)) {
                return prefix
            }
        }
        return null
    }

    getMessageType(message) {
        if (message.conversation) return 'conversation'
        if (message.extendedTextMessage) return 'extendedText'
        if (message.imageMessage) return 'image'
        if (message.videoMessage) return 'video'
        if (message.audioMessage) return 'audio'
        if (message.stickerMessage) return 'sticker'
        if (message.documentMessage) return 'document'
        if (message.documentWithCaptionMessage) return 'documentWithCaption'
        if (message.contactMessage) return 'contact'
        if (message.contactsArrayMessage) return 'contactsArray'
        if (message.locationMessage) return 'location'
        if (message.liveLocationMessage) return 'liveLocation'
        if (message.buttonsMessage) return 'buttons'
        if (message.buttonsResponseMessage) return 'buttonsResponse'
        if (message.templateMessage) return 'template'
        if (message.templateButtonReplyMessage) return 'templateButtonReply'
        if (message.listMessage) return 'list'
        if (message.listResponseMessage) return 'listResponse'
        if (message.reactionMessage) return 'reaction'
        if (message.pollCreationMessage) return 'pollCreation'
        if (message.pollUpdateMessage) return 'pollUpdate'
        return 'unknown'
    }

    getMessageContent(message, type) {
        switch(type) {
            case 'conversation':
                return message.conversation
            case 'extendedText':
                return message.extendedTextMessage.text
            case 'image':
                return message.imageMessage.caption || ''
            case 'video':
                return message.videoMessage.caption || ''
            case 'document':
                return message.documentMessage.caption || ''
            case 'documentWithCaption':
                return message.documentWithCaptionMessage.message?.documentMessage?.caption || ''
            default:
                return ''
        }
    }

    async executeCommand(command, args, context) {
        try {
            // Log command execution
            const cleanSender = this.db.cleanJid(context.sender)
            const senderNumber = cleanSender.split('@')[0]
            console.log(`⚡ Command: .${command} | User: @${senderNumber} | Args: ${args.join(' ')}`)
            
            // Execute command
            await caseHandler(command, context, args)
            
        } catch (error) {
            console.error(`Error executing command ${command}:`, error)
            
            await this.sock.sendMessage(context.from, {
                text: `❌ *ERROR*\n\n` +
                      `Terjadi kesalahan saat menjalankan command: .${command}\n\n` +
                      `Error: ${error.message}\n\n` +
                      `Silakan coba lagi atau hubungi owner.`
            })
        }
    }

    async sendStartupMessage() {
        try {
            const ownerData = this.db.load('owner.json')
            const mainOwnerJid = this.db.formatJid(ownerData.mainOwner[0])
            
            if (!mainOwnerJid) return
            
            const uptime = this.formatDuration(0)
            const stats = this.db.getDatabaseStats()
            const pluginsInfo = this.pluginManager.getPluginInfo()
            
            const startupMessage = `╭━━━━━━━━━━━━━━━┈➤\n` +
                                  `┃🤖 *${CONFIG.botName} CONNECTED*\n` +
                                  `╰━━━━━━━━━━━━━━━┈➤\n\n` +
                                  `✅ Status: Online\n` +
                                  `⏰ Waktu: ${new Date().toLocaleString('id-ID')}\n\n` +
                                  `📊 *Statistics:*\n` +
                                  `  • Users: ${stats.totalUsers}\n` +
                                  `  • Premium: ${stats.totalPremium}\n` +
                                  `  • Partners: ${stats.totalPartners}\n` +
                                  `  • Plugins: ${pluginsInfo.length}\n` +
                                  `  • Messages: ${this.messageCount}\n` +
                                  `  • Commands: ${this.commandCount}\n\n` +
                                  `🤖 Bot siap digunakan!\n` +
                                  `Ketik .menu untuk melihat commands`
            
            await this.sock.sendMessage(mainOwnerJid, { text: startupMessage })
            console.log('📤 Startup message sent to owner')
            
        } catch (error) {
            console.error('Error sending startup message:', error)
        }
    }

    startReminderEngine() {
        console.log('⏰ Reminder engine started')
        
        this.reminderInterval = setInterval(async () => {
            try {
                const pendingReminders = this.db.getPendingReminders()
                
                for (const reminder of pendingReminders) {
                    const jid = this.db.formatJid(reminder.user)
                    
                    if (jid) {
                        const reminderMessage = `⏰ *REMINDER*\n\n` +
                                               `${reminder.message}\n\n` +
                                               `📅 Waktu: ${new Date(reminder.executeAt).toLocaleString('id-ID')}\n` +
                                               `🆔 ID: ${reminder.id}`
                        
                        await this.sock.sendMessage(jid, { text: reminderMessage })
                        
                        // Update reminder status
                        this.db.updateReminderStatus(reminder.id, 'executed')
                        
                        console.log(`✅ Reminder executed: ${reminder.id} for ${reminder.user}`)
                    }
                }
            } catch (error) {
                console.error('Error in reminder engine:', error)
            }
        }, CONFIG.reminderCheckInterval)
    }

    startHealthCheck() {
        console.log('🏥 Health check started')
        
        setInterval(() => {
            const memoryUsage = process.memoryUsage()
            const memoryPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
            
            if (memoryPercent > 80) {
                console.warn(`⚠️ High memory usage: ${memoryPercent.toFixed(2)}%`)
                
                // Clear database cache
                this.db.clearCache()
                
                // Force garbage collection if available
                if (global.gc) {
                    global.gc()
                    console.log('♻️ Garbage collection executed')
                }
            }
            
            // Log status every 5 minutes
            if (this.messageCount % 500 === 0 && this.messageCount > 0) {
                console.log(`📊 Status: ${this.messageCount} messages, ${this.commandCount} commands, Memory: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`)
            }
        }, 60000) // Check every minute
    }

    setupGracefulShutdown() {
        process.on('SIGINT', async () => {
            console.log('\n=================================')
            console.log('     SHUTTING DOWN GRACEFULLY')
            console.log('=================================')
            
            // Clear intervals
            if (this.reminderInterval) {
                clearInterval(this.reminderInterval)
            }
            
            // Save store
            if (this.store) {
                this.store.writeToFile(path.join(__dirname, 'store.json'))
            }
            
            // Clear cache
            this.db.clearCache()
            
            console.log('✅ Cleanup complete')
            console.log('👋 Goodbye!')
            process.exit(0)
        })

        process.on('unhandledRejection', (error) => {
            console.error('❌ Unhandled rejection:', error)
        })

        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught exception:', error)
        })
    }

    formatDuration(timestamp) {
        const now = Date.now()
        const diff = now - timestamp
        const seconds = Math.floor(diff / 1000)
        const minutes = Math.floor(seconds / 60)
        const hours = Math.floor(minutes / 60)
        const days = Math.floor(hours / 24)
        
        if (days > 0) return `${days} hari ${hours % 24} jam`
        if (hours > 0) return `${hours} jam ${minutes % 60} menit`
        if (minutes > 0) return `${minutes} menit ${seconds % 60} detik`
        return `${seconds} detik`
    }
}

// ==================== MAIN ====================
const bot = new WhatsAppBot()

bot.start().catch(error => {
    console.error('❌ Fatal error starting bot:', error)
    process.exit(1)
})

module.exports = WhatsAppBot
