import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const git = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
  encoding: 'utf8',
})

if (git.status !== 0) {
  process.stderr.write(git.stderr || 'Não foi possível listar os arquivos do projeto.\n')
  process.exit(git.status || 1)
}

const forbidden = [
  'TheBiker ' + 'Insights',
  'thebiker-' + 'insights',
  'Insights' + ' oficiais',
  '>INS' + 'IGHTS<',
]

const failures = []
const files = git.stdout.split('\0').filter(Boolean)

for (const file of files) {
  for (const marker of forbidden) {
    if (file.includes(marker)) failures.push(`${file}: nome de arquivo contém ${marker}`)
  }

  let content
  try {
    content = readFileSync(file)
  } catch {
    continue
  }
  if (content.includes(0)) continue

  const text = content.toString('utf8')
  for (const marker of forbidden) {
    if (text.includes(marker)) failures.push(`${file}: conteúdo contém ${marker}`)
  }
}

if (failures.length) {
  process.stderr.write(`Marca antiga encontrada:\n${failures.join('\n')}\n`)
  process.exit(1)
}

process.stdout.write(`Marca validada em ${files.length} arquivos: TheBiker Blog.\n`)
