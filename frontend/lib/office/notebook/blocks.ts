export type BlockCategory = "basics" | "math" | "logic" | "visual" | "graph" | "plot"

export type BlockFieldType =
  | "text"
  | "expression"
  | "number"
  | "select"
  | "boolean"

export interface BlockOption {
  value: string
  label: string
}

export interface BlockField {
  key: string
  label: string
  type: BlockFieldType
  placeholder?: string
  default?: string | number | boolean
  options?: BlockOption[]
  allowEmpty?: boolean
}

export interface BlockDefinition {
  id: string
  category: BlockCategory
  name: string
  description: string
  color: string
  fields: BlockField[]
  toLua: (values: Record<string, any>, indent: number) => string[]
}

export interface BlockInstance {
  id: string
  blockId: string
  values: Record<string, any>
  enabled?: boolean
}

const INDENT = "  "

export const BLOCK_CATEGORIES: { id: BlockCategory; label: string; color: string }[] = [
  { id: "basics", label: "Basics", color: "#6366f1" },
  { id: "math", label: "Math", color: "#f97316" },
  { id: "logic", label: "Logic", color: "#eab308" },
  { id: "visual", label: "Visual", color: "#10b981" },
  { id: "graph", label: "Graph", color: "#06b6d4" },
  { id: "plot", label: "Plot 3D", color: "#a855f7" },
]

function pad(indent: number, line: string): string {
  return INDENT.repeat(indent) + line
}

function str(v: any): string {
  const s = String(v ?? "")
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`
}

function expr(v: any, fallback = "nil"): string {
  const s = String(v ?? "").trim()
  return s ? s : fallback
}

function num(v: any, fallback = 0): string {
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : String(fallback)
}

function bool(v: any): string {
  return v === true || v === "true" ? "true" : "false"
}

export function blocksToLua(blocks: BlockInstance[]): string {
  const out: string[] = []
  for (const b of blocks) {
    const def = getBlockById(b.blockId)
    if (!def) {
      out.push(`-- unknown block: ${b.blockId}`)
      continue
    }
    const lines = def.toLua(b.values ?? {}, 0)
    if (b.enabled === false) {
      out.push(`-- ▶ disabled "${def.name}"`)
      for (const line of lines) out.push(`--   ${line.replace(/\n/g, "\n--   ")}`)
    } else {
      for (const line of lines) out.push(line)
    }
  }
  return out.join("\n")
}

export const BLOCK_DEFINITIONS: BlockDefinition[] = [
  {
    id: "print",
    category: "basics",
    name: "Print",
    description: "Print a value to the cell output",
    color: "#6366f1",
    fields: [{ key: "value", label: "Value", type: "expression", placeholder: "1 + 2 or a variable", default: "" }],
    toLua: (v) => [`print(${expr(v.value)})`],
  },
  {
    id: "set_var",
    category: "basics",
    name: "Set variable",
    description: "Create a variable with a value",
    color: "#6366f1",
    fields: [
      { key: "name", label: "Name", type: "text", placeholder: "x", default: "x" },
      { key: "value", label: "Value", type: "expression", placeholder: "10", default: "10" },
    ],
    toLua: (v) => [`local ${expr(v.name, "x")} = ${expr(v.value, "nil")}`],
  },
  {
    id: "comment_block",
    category: "basics",
    name: "Comment",
    description: "A note that is not executed",
    color: "#6366f1",
    fields: [{ key: "text", label: "Text", type: "text", placeholder: "explain your code", default: "" }],
    toLua: (v) => [`-- ${String(v.text ?? "").replace(/\n/g, " ")}`],
  },
  {
    id: "for_loop",
    category: "basics",
    name: "For loop",
    description: "Repeat inner blocks a range of times",
    color: "#6366f1",
    fields: [
      { key: "var", label: "Variable", type: "text", placeholder: "i", default: "i" },
      { key: "from", label: "From", type: "expression", default: "1" },
      { key: "to", label: "To", type: "expression", default: "10" },
      { key: "body", label: "Body blocks (JSON)", type: "text", placeholder: '[]', default: "[]" },
    ],
    toLua: (v, ind) => {
      const out = [pad(ind, `for ${expr(v.var, "i")} = ${expr(v.from, "1")}, ${expr(v.to, "10")} do`)]
      let body: BlockInstance[] = []
      try {
        const json = JSON.parse(v.body ?? "[]")
        if (Array.isArray(json)) body = json
      } catch {
        /* uwu */
      }
      for (const child of body) {
        const def = getBlockById(child.blockId)
        if (!def) continue
        for (const line of def.toLua(child.values ?? {}, ind + 1)) out.push(line)
      }
      out.push(pad(ind, "end"))
      return out
    },
  },
  {
    id: "wait",
    category: "basics",
    name: "Wait (sleep)",
    description: "Pause the script for a number of milliseconds",
    color: "#6366f1",
    fields: [{ key: "ms", label: "Milliseconds", type: "number", default: "1000" }],
    toLua: (v) => [`NB.sleep(${num(v.ms, 1000)})`],
  },

  {
    id: "assign_math",
    category: "math",
    name: "Math operation",
    description: "Compute a + b and store the result in a variable",
    color: "#f97316",
    fields: [
      { key: "name", label: "Result variable", type: "text", default: "result" },
      { key: "op", label: "Operator", type: "select", default: "+", options: [
        { value: "+", label: "+ add" },
        { value: "-", label: "− subtract" },
        { value: "*", label: "× multiply" },
        { value: "/", label: "÷ divide" },
        { value: "^", label: "^ power" },
        { value: "%", label: "% modulo" },
      ] },
      { key: "a", label: "a", type: "expression", default: "5" },
      { key: "b", label: "b", type: "expression", default: "3" },
    ],
    toLua: (v) => [`local ${expr(v.name, "result")} = ${expr(v.a, "0")} ${String(v.op ?? "+")} ${expr(v.b, "0")}`],
  },
  {
    id: "math_func",
    category: "math",
    name: "Math function",
    description: "Apply a function to a value and store the result",
    color: "#f97316",
    fields: [
      { key: "name", label: "Result variable", type: "text", default: "result" },
      { key: "fn", label: "Function", type: "select", default: "math.abs", options: [
        { value: "math.abs", label: "abs" },
        { value: "math.floor", label: "floor" },
        { value: "math.ceil", label: "ceil" },
        { value: "math.sqrt", label: "sqrt" },
        { value: "math.sin", label: "sin" },
        { value: "math.cos", label: "cos" },
      ] },
      { key: "value", label: "Value", type: "expression", default: "-4" },
    ],
    toLua: (v) => [`local ${expr(v.name, "result")} = ${expr(v.fn, "math.abs")}(${expr(v.value, "0")})`],
  },
  {
    id: "concat_text",
    category: "math",
    name: "Combine text",
    description: "Concatenate two strings into a variable",
    color: "#f97316",
    fields: [
      { key: "name", label: "Result variable", type: "text", default: "msg" },
      { key: "a", label: "First part", type: "text", default: "Hello " },
      { key: "b", label: "Second part", type: "text", default: "world" },
    ],
    toLua: (v) => [`local ${expr(v.name, "msg")} = ${str(v.a)} .. ${str(v.b)}`],
  },

  {
    id: "if_block",
    category: "logic",
    name: "If condition",
    description: "Run blocks when a condition is true (else other blocks)",
    color: "#eab308",
    fields: [
      { key: "condition", label: "Condition", type: "expression", placeholder: "x > 5", default: "true" },
      { key: "then_blocks", label: "Then blocks (JSON)", type: "text", default: "[]" },
      { key: "else_blocks", label: "Else blocks (JSON)", type: "text", default: "[]" },
    ],
    toLua: (v, ind) => {
      const out = [pad(ind, `if ${expr(v.condition, "true")} then`)]
      const body = (json: string) => {
        const list: BlockInstance[] = []
        try {
          const parsed = JSON.parse(json ?? "[]")
          if (Array.isArray(parsed)) return parsed
        } catch {
          /* ignore */
        }
        return list
      }
      for (const child of body(v.then_blocks)) {
        const def = getBlockById(child.blockId)
        if (!def) continue
        for (const line of def.toLua(child.values ?? {}, ind + 1)) out.push(line)
      }
      const elseList = body(v.else_blocks)
      if (elseList.length > 0) {
        out.push(pad(ind, "else"))
        for (const child of elseList) {
          const def = getBlockById(child.blockId)
          if (!def) continue
          for (const line of def.toLua(child.values ?? {}, ind + 1)) out.push(line)
        }
      }
      out.push(pad(ind, "end"))
      return out
    },
  },
  {
    id: "while_loop",
    category: "logic",
    name: "While loop",
    description: "Repeat inner blocks while a condition stays true",
    color: "#eab308",
    fields: [
      { key: "condition", label: "Condition", type: "expression", default: "true" },
      { key: "body", label: "Body blocks (JSON)", type: "text", default: "[]" },
    ],
    toLua: (v, ind) => {
      const out = [pad(ind, `while ${expr(v.condition, "true")} do`)]
      let body: BlockInstance[] = []
      try {
        const parsed = JSON.parse(v.body ?? "[]")
        if (Array.isArray(parsed)) body = parsed
      } catch {
        /* ignore */
      }
      for (const child of body) {
        const def = getBlockById(child.blockId)
        if (!def) continue
        for (const line of def.toLua(child.values ?? {}, ind + 1)) out.push(line)
      }
      out.push(pad(ind, "end"))
      return out
    },
  },
  {
    id: "compare",
    category: "logic",
    name: "Compare",
    description: "Print whether a comparison is true",
    color: "#eab308",
    fields: [
      { key: "a", label: "a", type: "expression", default: "3" },
      { key: "op", label: "Operator", type: "select", default: ">", options: [
        { value: ">", label: ">" },
        { value: ">=", label: "≥" },
        { value: "<", label: "<" },
        { value: "<=", label: "≤" },
        { value: "==", label: "=" },
        { value: "~=", label: "≠" },
      ] },
      { key: "b", label: "b", type: "expression", default: "2" },
    ],
    toLua: (v) => [`print(${expr(v.a, "0")} ${String(v.op ?? ">")} ${expr(v.b, "0")})`],
  },

  {
    id: "canvas_new",
    category: "visual",
    name: "New canvas",
    description: "Reset the drawing board to a size",
    color: "#10b981",
    fields: [
      { key: "width", label: "Width", type: "number", default: "640" },
      { key: "height", label: "Height", type: "number", default: "480" },
    ],
    toLua: (v) => [`canvas.new(${num(v.width, 640)}, ${num(v.height, 480)})`],
  },
  {
    id: "canvas_bg",
    category: "visual",
    name: "Background colour",
    description: "Fill the canvas background",
    color: "#10b981",
    fields: [{ key: "color", label: "Colour", type: "text", default: "#ffffff" }],
    toLua: (v) => [`canvas.bg(${str(v.color)})`],
  },
  {
    id: "canvas_fill_circle",
    category: "visual",
    name: "Fill circle",
    description: "Draw a filled circle",
    color: "#10b981",
    fields: [
      { key: "x", label: "X", type: "number", default: "320" },
      { key: "y", label: "Y", type: "number", default: "240" },
      { key: "r", label: "Radius", type: "number", default: "50" },
      { key: "color", label: "Colour", type: "text", default: "#6366f1" },
    ],
    toLua: (v) => [
      `canvas.fill(${str(v.color)})`,
      `canvas.fillCircle(${num(v.x, 0)}, ${num(v.y, 0)}, ${num(v.r, 50)})`,
    ],
  },
  {
    id: "canvas_circle",
    category: "visual",
    name: "Circle (outline)",
    description: "Draw an outlined circle",
    color: "#10b981",
    fields: [
      { key: "x", label: "X", type: "number", default: "320" },
      { key: "y", label: "Y", type: "number", default: "240" },
      { key: "r", label: "Radius", type: "number", default: "50" },
      { key: "color", label: "Colour", type: "text", default: "#ef4444" },
    ],
    toLua: (v) => [
      `canvas.stroke(${str(v.color)}, 2)`,
      `canvas.circle(${num(v.x, 0)}, ${num(v.y, 0)}, ${num(v.r, 50)})`,
    ],
  },
  {
    id: "canvas_rect",
    category: "visual",
    name: "Fill rectangle",
    description: "Draw a filled rectangle",
    color: "#10b981",
    fields: [
      { key: "x", label: "X", type: "number", default: "100" },
      { key: "y", label: "Y", type: "number", default: "100" },
      { key: "w", label: "Width", type: "number", default: "200" },
      { key: "h", label: "Height", type: "number", default: "120" },
      { key: "color", label: "Colour", type: "text", default: "#f97316" },
    ],
    toLua: (v) => [
      `canvas.fill(${str(v.color)})`,
      `canvas.fillRect(${num(v.x, 0)}, ${num(v.y, 0)}, ${num(v.w, 100)}, ${num(v.h, 100)})`,
    ],
  },
  {
    id: "canvas_line",
    category: "visual",
    name: "Line",
    description: "Draw a line between two points",
    color: "#10b981",
    fields: [
      { key: "x1", label: "X start", type: "number", default: "50" },
      { key: "y1", label: "Y start", type: "number", default: "200" },
      { key: "x2", label: "X end", type: "number", default: "590" },
      { key: "y2", label: "Y end", type: "number", default: "200" },
      { key: "color", label: "Colour", type: "text", default: "#111111" },
    ],
    toLua: (v) => [`canvas.line(${num(v.x1, 0)}, ${num(v.y1, 0)}, ${num(v.x2, 100)}, ${num(v.y2, 100)}, ${str(v.color)}, 2)`],
  },
  {
    id: "canvas_text",
    category: "visual",
    name: "Text",
    description: "Draw text on the canvas",
    color: "#10b981",
    fields: [
      { key: "text", label: "Text", type: "text", default: "Hello" },
      { key: "x", label: "X", type: "number", default: "120" },
      { key: "y", label: "Y", type: "number", default: "120" },
      { key: "size", label: "Font size", type: "number", default: "28" },
      { key: "color", label: "Colour", type: "text", default: "#18181b" },
    ],
    toLua: (v) => [
      `canvas.text(${str(v.text)}, ${num(v.x, 0)}, ${num(v.y, 0)}, ${num(v.size, 28)}, ${str(v.color)}, "center")`,
    ],
  },
  {
    id: "chart_line",
    category: "visual",
    name: "Line chart",
    description: "Plot a series of numbers",
    color: "#10b981",
    fields: [
      { key: "data", label: "Data (Lua table)", type: "expression", default: "{1, 3, 2, 5, 4, 8}" },
      { key: "name", label: "Series name", type: "text", default: "data" },
      { key: "color", label: "Colour", type: "text", default: "" },
    ],
    toLua: (v) => [
      `chart.line(${expr(v.data, "{}")}, ${["{ name = ", str(v.name), typeof v.color === "string" && v.color ? `, color = ${str(v.color)}` : "", " }"].join("")})`,
    ],
  },
  {
    id: "chart_fn",
    category: "visual",
    name: "Plot function",
    description: "Plot y = f(x) over a range",
    color: "#10b981",
    fields: [
      { key: "fn", label: "Expression f(x)", type: "text", default: "math.sin(x)" },
      { key: "xmin", label: "X min", type: "expression", default: "0" },
      { key: "xmax", label: "X max", type: "expression", default: "6.28318" },
      { key: "name", label: "Series name", type: "text", default: "f(x)" },
    ],
    toLua: (v) => {
      const f = String(v.fn ?? "math.sin(x)").trim() || "math.sin(x)"
      return [
        `chart.fn(function(x) return (${f}) end, { name = ${str(v.name)}, xmin = ${expr(v.xmin, "0")}, xmax = ${expr(v.xmax, "6.28318")} })`,
      ]
    },
  },
  {
    id: "chart_histogram",
    category: "visual",
    name: "Histogram",
    description: "Bin a list of numbers into a bar chart",
    color: "#10b981",
    fields: [
      { key: "data", label: "Data (Lua table)", type: "expression", default: "{math.random(1, 10), math.random(1, 10), math.random(1, 10), math.random(1, 10), math.random(1, 10)}" },
      { key: "bins", label: "Bins", type: "number", default: "5" },
    ],
    toLua: (v) => [`chart.histogram(${expr(v.data, "{}")}, { bins = ${num(v.bins, 5)} })`],
  },

  {
    id: "graph_new",
    category: "graph",
    name: "New graph",
    description: "Reset the node graph",
    color: "#06b6d4",
    fields: [],
    toLua: () => [`graph.clear()`],
  },
  {
    id: "graph_add_node",
    category: "graph",
    name: "Add node",
    description: "Add a labelled node to the graph",
    color: "#06b6d4",
    fields: [
      { key: "id", label: "Node id", type: "text", default: "A" },
      { key: "label", label: "Label", type: "text", default: "" },
    ],
    toLua: (v) => [`graph.addNode(${str(v.id)}, { label = ${str(v.label || v.id)} })`],
  },
  {
    id: "graph_add_edge",
    category: "graph",
    name: "Add edge",
    description: "Connect two existing nodes",
    color: "#06b6d4",
    fields: [
      { key: "a", label: "From", type: "text", default: "A" },
      { key: "b", label: "To", type: "text", default: "B" },
      { key: "weight", label: "Weight", type: "expression", default: "" },
      { key: "directed", label: "Directed", type: "boolean", default: false },
    ],
    toLua: (v) => {
      const weight =
        typeof v.weight === "string" && v.weight.trim() ? `, weight = ${v.weight.trim()}` : ""
      return [`graph.addEdge(${str(v.a)}, ${str(v.b)}, { directed = ${bool(v.directed)}${weight} })`]
    },
  },
  {
    id: "graph_ring",
    category: "graph",
    name: "Ring layout",
    description: "Arrange nodes in a circle",
    color: "#06b6d4",
    fields: [],
    toLua: () => [`graph.layout("ring")`, `graph.draw()`],
  },
  {
    id: "graph_grid",
    category: "graph",
    name: "Grid layout",
    description: "Arrange nodes on a grid",
    color: "#06b6d4",
    fields: [],
    toLua: () => [`graph.layout("grid")`, `graph.draw()`],
  },
  {
    id: "graph_fn",
    category: "graph",
    name: "Plot function",
    description:
      "Plot y = f(x) from an expression (GeoGebra-style). Globals defined in other cells are usable: a*x^2",
    color: "#06b6d4",
    fields: [
      { key: "fn", label: "Expression f(x)", type: "text", default: "x^2", placeholder: "e.g. x^2, 2*x + a, sin(x)" },
      { key: "xmin", label: "X min", type: "expression", default: "-10" },
      { key: "xmax", label: "X max", type: "expression", default: "10" },
      { key: "area", label: "Fill below curve", type: "boolean", default: false },
      { key: "name", label: "Legend label", type: "text", default: "" },
    ],
    toLua: (v) => {
      const f = String(v.fn ?? "").trim() || "x^2"
      const opts = [
        typeof v.xmin === "string" && v.xmin.trim() ? `xmin = ${v.xmin.trim()}` : null,
        typeof v.xmax === "string" && v.xmax.trim() ? `xmax = ${v.xmax.trim()}` : null,
        v.area === true ? "area = true" : null,
        typeof v.name === "string" && v.name.trim() ? `name = ${str(v.name.trim())}` : null,
      ]
        .filter(Boolean)
        .join(", ")
      return [`graph.fn(${str(f)}${opts ? `, { ${opts} }` : ""})`]
    },
  },
  {
    id: "graph_integral",
    category: "graph",
    name: "Shaded area (integral)",
    description:
      "Shade the region under y = f(x) between X from and X to, and label it with the definite-integral value (GeoGebra style)",
    color: "#0ea5e9",
    fields: [
      { key: "fn", label: "Expression f(x)", type: "text", default: "x^2", placeholder: "e.g. x^2, sin(x), f(x)" },
      { key: "from", label: "Interval from", type: "expression", default: "0" },
      { key: "to", label: "Interval to", type: "expression", default: "2" },
      { key: "name", label: "Legend label", type: "text", default: "" },
    ],
    toLua: (v) => {
      const f = String(v.fn ?? "").trim() || "x^2"
      const opts = typeof v.name === "string" && v.name.trim() ? `, { name = ${str(v.name.trim())} }` : ""
      return [`graph.integral(${str(f)}, ${expr(v.from, "0")}, ${expr(v.to, "2")}${opts})`]
    },
  },

  {
    id: "plot_surface",
    category: "plot",
    name: "Surface plot",
    description: "Plot z = f(x, y) as a 3D surface",
    color: "#a855f7",
    fields: [
      { key: "fn", label: "Expression f(x, y)", type: "text", default: "math.sin(x) * math.cos(y)" },
      { key: "xmin", label: "X min", type: "expression", default: "-2" },
      { key: "xmax", label: "X max", type: "expression", default: "2" },
      { key: "ymin", label: "Y min", type: "expression", default: "-2" },
      { key: "ymax", label: "Y max", type: "expression", default: "2" },
    ],
    toLua: (v) => {
      const f = String(v.fn ?? "math.sin(x) * math.cos(y)").trim() || "math.sin(x) * math.cos(y)"
      return [
        `plot3d.fn(function(x, y) return (${f}) end, { xmin = ${expr(v.xmin, "-2")}, xmax = ${expr(v.xmax, "2")}, ymin = ${expr(v.ymin, "-2")}, ymax = ${expr(v.ymax, "2")} })`,
      ]
    },
  },
]

export function getBlockById(id: string): BlockDefinition | undefined {
  return BLOCK_DEFINITIONS.find((d) => d.id === id)
}

export function blocksByCategory(category: BlockCategory): BlockDefinition[] {
  return BLOCK_DEFINITIONS.filter((d) => d.category === category)
}