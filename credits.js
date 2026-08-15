/* 
 * apple-ndiibot
 * created by ndii
 * © 2026
 */

const fs = require('fs')
const path = require('path')

const CREDIT = `/* 
 * apple-ndiibot
 * created by ndii
 * https://whatsapp.com/channel/0029Vb69nLG23n3aRi3cpf2U   
 * FestiveShopID: 087717274346
 * © 2024-2026
 */
`

class CreditInjector {
    constructor() {
        this.rootDir = __dirname
        this.excludeDirs = ['node_modules', '.git', 'tmp']
        this.excludeFiles = ['credits.js', 'package-lock.json']
        this.totalFiles = 0
        this.updatedFiles = 0
        this.skippedFiles = 0
        this.failedFiles = 0
    }

    start() {
        console.log('=================================')
        console.log('  APPLE-NDIIBOT CREDIT INJECTOR')
        console.log('=================================')
        console.log('Scanning project files...\n')
        
        this.scanDirectory(this.rootDir)
        
        console.log('\n=================================')
        console.log('SCAN RESULT')
        console.log('=================================')
        console.log(`Total files scanned: ${this.totalFiles}`)
        console.log(`Files updated: ${this.updatedFiles}`)
        console.log(`Files skipped (already have credit): ${this.skippedFiles}`)
        console.log(`Files failed: ${this.failedFiles}`)
        console.log('=================================')
        
        if (this.failedFiles > 0) {
            process.exit(1)
        }
    }

    scanDirectory(dirPath) {
        try {
            const files = fs.readdirSync(dirPath)
            
            files.forEach(file => {
                const filePath = path.join(dirPath, file)
                const stat = fs.statSync(filePath)
                
                if (stat.isDirectory()) {
                    if (!this.excludeDirs.includes(file)) {
                        this.scanDirectory(filePath)
                    }
                } else if (stat.isFile()) {
                    if (path.extname(file) === '.js' && !this.excludeFiles.includes(file)) {
                        this.processFile(filePath)
                    }
                }
            })
        } catch (error) {
            console.error(`Error scanning directory ${dirPath}:`, error)
        }
    }

    processFile(filePath) {
        this.totalFiles++
        
        try {
            const content = fs.readFileSync(filePath, 'utf8')
            
            // Check if credit already exists
            if (this.hasCredit(content)) {
                this.skippedFiles++
                console.log(`⏭️  Skipped (credit exists): ${path.relative(this.rootDir, filePath)}`)
                return
            }
            
            // Check if file starts with shebang or other important directives
            const lines = content.split('\n')
            let insertIndex = 0
            
            if (lines[0].startsWith('#!')) {
                // Keep shebang at top, insert credit after
                insertIndex = 1
            }
            
            // Insert credit
            lines.splice(insertIndex, 0, CREDIT)
            const updatedContent = lines.join('\n')
            
            // Write back to file
            fs.writeFileSync(filePath, updatedContent, 'utf8')
            this.updatedFiles++
            
            console.log(`✅ Updated: ${path.relative(this.rootDir, filePath)}`)
        } catch (error) {
            this.failedFiles++
            console.error(`❌ Failed: ${path.relative(this.rootDir, filePath)} - ${error.message}`)
        }
    }

    hasCredit(content) {
        const creditLines = CREDIT.split('\n').filter(line => line.trim() !== '')
        const contentLines = content.split('\n')
        
        // Check if all credit lines appear in content
        return creditLines.every(creditLine => 
            contentLines.some(line => line.trim() === creditLine.trim())
        )
    }
}

// Run injector
const injector = new CreditInjector()
injector.start()
