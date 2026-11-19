export interface SkillExample {
  name: string
  input: string
  output: string
}

export function buildSystemInstruction(
  skill: string,
  glossary: string,
  examples: SkillExample[],
): string {
  const sections = [skill.trim(), glossary.trim()]
  if (examples.length > 0) {
    const rendered = examples.map(
      (example) =>
        `### Příklad: ${example.name}\n\nVstup:\n\n${example.input.trim()}\n\nOčekávaný výstup:\n\n${example.output.trim()}`,
    )
    sections.push(`# Příklady\n\n${rendered.join('\n\n')}`)
  }
  return sections.join('\n\n')
}

import glossary from './skill/glossary.md?raw'
import skill from './skill/SKILL.md?raw'

const rawExamples = import.meta.glob('./skill/examples/*.{txt,json}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// Příklad tvoří dvojice <název>.txt (vstup) a <název>.json (očekávaný výstup).
function loadExamples(): SkillExample[] {
  const examples: SkillExample[] = []
  for (const [path, input] of Object.entries(rawExamples)) {
    const name = path.match(/\/([^/]+)\.txt$/)?.[1]
    const output = name && rawExamples[`./skill/examples/${name}.json`]
    if (name && output) examples.push({ name, input, output })
  }
  return examples.sort((a, b) => a.name.localeCompare(b.name))
}

export const examples = loadExamples()

export const systemInstruction = buildSystemInstruction(skill, glossary, examples)
