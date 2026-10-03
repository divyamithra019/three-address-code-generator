import { useState } from "react";
import "./App.css";

/* ================= EXAMPLES ================= */

const EXAMPLES = [
  "a = b + c * d",
  "x = (p + q) / r",
  "a = -b + c",
  "a = b - c - d",
  "result = a * b / c",
  "x = 10 * 2 + 5",
  "a = b % c + d",
];

const ERROR_EXAMPLES = [
  "a = b + * c",
  "a = (b + c",
  "a = b +",
  "b + c",
  "a = b @ c",
  "a =",
];

const MODE_HINTS = {
  quick: "Quick: just the answer.",
  smart: "Smart: step-by-step with reasons.",
  learn:
    "Learn: the full pipeline — tokens, precedence, tree, substitution.",
};

/* ================= TOKENIZER ================= */

function tokenize(input) {
  const tokens = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let value = ch;
      i++;

      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        value += input[i];
        i++;
      }

      tokens.push({
        type: "IDENT",
        value,
      });

      continue;
    }

    if (/[0-9]/.test(ch)) {
      let value = ch;
      i++;

      while (i < input.length && /[0-9.]/.test(input[i])) {
        value += input[i];
        i++;
      }

      tokens.push({
        type: "NUMBER",
        value,
      });

      continue;
    }

    if ("+-*/%".includes(ch)) {
      tokens.push({
        type: "OP",
        value: ch,
      });

      i++;
      continue;
    }

    if (ch === "=") {
      tokens.push({
        type: "EQ",
        value: ch,
      });

      i++;
      continue;
    }

    if (ch === "(") {
      tokens.push({
        type: "LPAREN",
        value: ch,
      });

      i++;
      continue;
    }

    if (ch === ")") {
      tokens.push({
        type: "RPAREN",
        value: ch,
      });

      i++;
      continue;
    }

    throw new Error(
      `Invalid character "${ch}". Use identifiers, numbers, +, -, *, /, %, = and parentheses.`
    );
  }

  return tokens;
}

/* ================= PARSER ================= */

function parseExpression(input) {
  const tokens = tokenize(input);
  let position = 0;

  if (tokens.length === 0) {
    throw new Error("Please enter an expression.");
  }

  // IDENT = expression
  if (
    tokens[0].type !== "IDENT" ||
    tokens.length < 3 ||
    tokens[1].type !== "EQ"
  ) {
    throw new Error(
      "Expression must follow the form: variable = expression"
    );
  }

  const left = tokens[0].value;
  position = 2;

  function current() {
    return tokens[position];
  }

  function parseFactor() {
    const token = current();

    if (!token) {
      throw new Error("Expression is incomplete.");
    }

    // Unary minus
    if (token.type === "OP" && token.value === "-") {
      position++;

      const child = parseFactor();

      return {
        type: "unary",
        op: "-",
        child,
      };
    }

    if (token.type === "LPAREN") {
      position++;

      const node = parseAdditive();

      if (!current() || current().type !== "RPAREN") {
        throw new Error("Missing closing parenthesis ')'.");
      }

      position++;
      return node;
    }

    if (token.type === "IDENT" || token.type === "NUMBER") {
      position++;

      return {
        type: "value",
        value: token.value,
      };
    }

    throw new Error(`Unexpected token "${token.value}".`);
  }

  function parseMultiplicative() {
    let node = parseFactor();

    while (
      current() &&
      current().type === "OP" &&
      ["*", "/", "%"].includes(current().value)
    ) {
      const op = current().value;
      position++;

      const right = parseFactor();

      node = {
        type: "binary",
        op,
        left: node,
        right,
      };
    }

    return node;
  }

  function parseAdditive() {
    let node = parseMultiplicative();

    while (
      current() &&
      current().type === "OP" &&
      ["+", "-"].includes(current().value)
    ) {
      const op = current().value;
      position++;

      const right = parseMultiplicative();

      node = {
        type: "binary",
        op,
        left: node,
        right,
      };
    }

    return node;
  }

  const tree = parseAdditive();

  if (position < tokens.length) {
    throw new Error(`Unexpected token "${tokens[position].value}".`);
  }

  return {
    left,
    tree,
    tokens,
  };
}

/* ================= TAC GENERATOR ================= */

function parseTACInstructions(tacLines) {
  return tacLines.map((line) => {
    const [left, right] = line.split("=").map((part) => part.trim());

    if (!right) {
      return null;
    }

    // Binary operation
    const match = right.match(/^(.+?)\s*([+\-*/%])\s*(.+)$/);

    if (match) {
      return {
        result: left,
        operator: match[2],
        arg1: match[1].trim(),
        arg2: match[3].trim(),
      };
    }

    // Unary operation
    if (/^[+-]\s*\w+$/.test(right)) {
      return {
        result: left,
        operator: right.trim()[0],
        arg1: right.trim().slice(1).trim(),
        arg2: "-",
      };
    }

    // Simple assignment
    return {
      result: left,
      operator: "=",
      arg1: right,
      arg2: "-",
    };
  }).filter(Boolean);
}
function generateTAC(input) {
  const parsed = parseExpression(input);

  let tempCount = 0;
  const tac = [];
  const steps = [];

  function newTemp() {
    tempCount++;
    return `t${tempCount}`;
  }

  function visit(node) {
    if (node.type === "value") {
      return node.value;
    }

    if (node.type === "unary") {
      const child = visit(node.child);
      const temp = newTemp();

      tac.push(`${temp} = -${child}`);

      steps.push({
        generated: `${temp} = -${child}`,
        reason: "Unary minus is evaluated before other operations.",
      });

      return temp;
    }

    const left = visit(node.left);
    const right = visit(node.right);

    const temp = newTemp();

    tac.push(`${temp} = ${left} ${node.op} ${right}`);

    let reason = "";

    if (["*", "/", "%"].includes(node.op)) {
      reason = `${node.op} has higher precedence than + and -.`;
    } else {
      reason = `This ${node.op} operation is evaluated after higher-precedence operations.`;
    }

    steps.push({
      generated: `${temp} = ${left} ${node.op} ${right}`,
      reason,
    });

    return temp;
  }

  const result = visit(parsed.tree);

  tac.push(`${parsed.left} = ${result}`);

  steps.push({
    generated: `${parsed.left} = ${result}`,
    reason: "The final temporary is assigned to the left-hand variable.",
  });

  return {
    tac,
    steps,
    tokens: parsed.tokens,
    tree: parsed.tree,
  };
}

/* ================= TREE COMPONENT ================= */

function TreeNode({ node }) {
  if (!node) return null;
// leaf node
  if (node.type === "value") {
    return (
      <div className="tree-item">
        <div className="tree-node">{node.value}</div>
      </div>
    );
  }
//unary node
  if (node.type === "unary") {
    return (
      <div className="tree-item">
        <div className="tree-node">{node.op}</div>

        <div className="tree-children unary">
          <TreeNode node={node.child} />
        </div>
      </div>
    );
  }
//binary node
  return (
    <div className="tree-item">
      <div className="tree-node">{node.op}</div>

      <div className="tree-children binary">
        <TreeNode node={node.left} />
        <TreeNode node={node.right} />
      </div>
    </div>
  );
}
/* =================Quadruple ================= */

function buildQuadruples(tacLines) {
  const instructions = parseTACInstructions(tacLines);

  return instructions.map((item, index) => ({
    index,
    operator: item.operator,
    arg1: item.arg1,
    arg2: item.arg2,
    result: item.result,
  }));
}
/* =================Triple ================= */
function buildTriples(tacLines) {
  const instructions = parseTACInstructions(tacLines);

  const resultIndex = {};

  instructions.forEach((item, index) => {
    resultIndex[item.result] = index;
  });

  return instructions.map((item, index) => {
    const convertArg = (arg) => {
      if (resultIndex[arg] !== undefined) {
        return `(${resultIndex[arg]})`;
      }
      return arg;
    };

    return {
      index,
      operator: item.operator,
      arg1: convertArg(item.arg1),
      arg2:
        item.operator === "="
          ? item.result
          : convertArg(item.arg2),
    };
  });
}

/* ================= Indirect Triple ================= */
function buildIndirectTriples(tacLines) {
  const triples = buildTriples(tacLines);

  return {
    triples,
    pointers: triples.map((item) => ({
      pointer: item.index,
      triple: item.index,
    })),
  };
}



/* ================= APP ================= */

function App() {
  const [expression, setExpression] = useState("");
  const [generated, setGenerated] = useState(false);
  const [mode, setMode] = useState("quick");
  const [representation, setRepresentation] = useState("tac");
  const [showHistory, setShowHistory] = useState(false);

  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const [history, setHistory] = useState([]);

  const [stepIndex, setStepIndex] = useState(0);
const [isSpeaking, setIsSpeaking] = useState(false);
const [copied, setCopied] = useState(false);

const handleSpeak = () => {
  if (!result) return;

  window.speechSynthesis.cancel();

  let text = "";

  // QUICK MODE
  if (mode === "quick") {
    text = `
      Generated Three Address Code.
      ${result.tac.join(". ")}
    `;
  }

  // SMART MODE
  else if (mode === "smart") {

    // TAC → Generated TAC only
    if (representation === "tac") {
      text = `
        Generated Three Address Code.
        ${result.tac.join(". ")}
      `;
    }

    // Quadruple → Smart Explanation
    else if (representation === "quadruple") {
      text = `
        Smart Explanation hello

        Quadruple represents each instruction using
        four fields: Operator, Arg1, Arg2, and Result.

        The temporary variables such as t1 and t2
        store intermediate results.
      `;
    }

    // Triple → Smart Explanation
    else if (representation === "triple") {
      text = `
        Smart Explanation.

        Triple represents instructions using an index,
        Operator, Arg1, and Arg2.

        Previous results are referred to using their index,
        such as zero or one, instead of temporary names.
      `;
    }

    // Indirect Triple → Smart Explanation
    else if (representation === "indirect") {
      text = `step
        Smart Explanation.

        Indirect Triple uses the Triple representation
        together with a Pointer Table.

        The pointer table refers to triple entries
        by their index.
      `;
    }
  }

  // LEARN MODE
  else if (mode === "learn") {

    // TAC → Generated TAC only
    if (representation === "tac") {
      text = `
        Generated Three Address Code.
        ${result.tac.join(". ")}
      `;
    }

    // Quadruple → Learn explanation
    else if (representation === "quadruple") {
      text = `
        Learn mode.

        What is Quadruple?

        Quadruple represents each Three Address Code
        instruction using four fields:
        Operator, Arg1, Arg2, and Result.

        How to read the table.

        Operator is the operation being performed.
        Arg1 is the first operand.
        Arg2 is the second operand.
        Result is where the operation result is stored.

        Example.

        For t1 equals c multiplied by d,
        the operator is multiplication,
        the arguments are c and d,
        and the result is stored in t1.
      `;
    }

    // Triple → Learn explanation
    else if (representation === "triple") {
      text = `
        Learn: How the compiler thinks
1 · Tokens
The tokenizer splits the input into meaningful pieces.

IDENT a
EQ =
IDENT b
OP +
IDENT c
OP *
IDENT d
2 · Precedence
unary − → * / % → + − → =
Higher rules are evaluated first.

3 · Expression Structure
The parser builds a tree — deepest nodes are computed first.

4 · Temporary Variables
Each operation stores its result in t1, t2, t3 …

5 · Substitution
Later steps use temporaries instead of original sub-expressions.

6 · Final TAC
The last temporary is assigned to the left-hand variable.
      `;
    }

    // Indirect Triple → Learn explanation
    else if (representation === "indirect") {
      text = `
         Learn: How the compiler thinks
1 · Tokens
The tokenizer splits the input into meaningful pieces.

IDENT a
EQ =
IDENT b
OP +
IDENT c
OP *
IDENT d
2 · Precedence
unary − → * / % → + − → =
Higher rules are evaluated first.

3 · Expression Structure
The parser builds a tree — deepest nodes are computed first.

4 · Temporary Variables
Each operation stores its result in t1, t2, t3 …

5 · Substitution
Later steps use temporaries instead of original sub-expressions.

6 · Final TAC
The last temporary is assigned to the left-hand variable.
      `;
    }
  }

  const speech = new SpeechSynthesisUtterance(text);

  speech.rate = 0.85;
  speech.pitch = 1;

  speech.onstart = () => setIsSpeaking(true);
  speech.onend = () => setIsSpeaking(false);
  speech.onerror = () => setIsSpeaking(false);

  window.speechSynthesis.speak(speech);
};
const handleSpeakTAC = () => {
  if (!result || !result.tac) return;

  window.speechSynthesis.cancel();

  const text = `
    Generated Three Address Code.
    ${result.tac.join(". ")}
  `;

  const speech = new SpeechSynthesisUtterance(text);

  speech.rate = 0.85;
  speech.pitch = 1;

  speech.onstart = () => setIsSpeaking(true);
  speech.onend = () => setIsSpeaking(false);
  speech.onerror = () => setIsSpeaking(false);

  window.speechSynthesis.speak(speech);
};
const handleSpeakRepresentation = () => {
  if (!result || representation === "tac") return;

  window.speechSynthesis.cancel();

  let text = "";
//learn
  if (representation === "quadruple") {
    text = ` learn mode
   What is Quadruple?
Quadruple represents each Three Address Code instruction using four fields: Operator, Arg1, Arg2, and Result.

How to read the table
Operator: The operation being performed.

Arg1: The first operand.

Arg2: The second operand.

Result: Where the operation result is stored.

Example
For t1 = c * d, the operator is *, the arguments are c and d, and the result is stored in t1.`;
  }
// learn 
  else if (representation === "triple") {
    text = `
      Learn mode.

      What is Triple?

      Triple represents each instruction using an index,
      Operator, Arg1, and Arg2.
      Temporary variable names are replaced by references
      to instruction numbers.

      How to read the table.

      The number is the instruction number.
      Operator is the operation being performed.
      Arg1 and Arg2 are the operands used by the operation.

      What does zero in parentheses mean?

      Zero in parentheses refers to the result produced
      by Triple instruction zero.
      Similarly, one in parentheses refers to instruction one.
    `;
  }
// learn
  else if (representation === "indirect") {
    text = `
      Learn mode.
      
      What is Indirect Triple?

      Indirect Triple uses a Triple table together
      with a Pointer Table.

      How to read the tables.

      The Triple Table contains the actual operations.
      The Pointer Table contains references to the Triple entries.

      Why use pointers?

      Instead of directly changing the Triple entries,
      the pointer table can be used to refer to them.
    `;
  }

  const speech = new SpeechSynthesisUtterance(text);

  speech.rate = 0.85;
  speech.pitch = 1;

  speech.onstart = () => setIsSpeaking(true);
  speech.onend = () => setIsSpeaking(false);
  speech.onerror = () => setIsSpeaking(false);

  window.speechSynthesis.speak(speech);
};
const handleStopSpeak = () => {
  window.speechSynthesis.cancel();
  setIsSpeaking(false);
};

  /* ================= GENERATE ================= */
const handleGenerate = async () => {
  if (!expression.trim()) {
    setError("Please enter an expression.");
    setGenerated(false);
    return;
  }

  try {
    const response = await fetch(
      "https://three-address-code-generator-1.onrender.com/api/tac/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expression: expression.trim(),
        }),
      }
    );

    const data = await response.json();

    if (!data.success) {
      setError(data.error || "Invalid expression.");
      setGenerated(false);
      setResult(null);
      return;
    }

    // Frontend generates the complete learning information
    const frontendOutput = generateTAC(expression.trim());

    // Use backend TAC if available.
    // Otherwise use frontend TAC to prevent blank page.
    const backendTac = Array.isArray(data.tac)
      ? data.tac
      : frontendOutput.tac;

    const output = {
      ...frontendOutput,
      tac: backendTac,
    };

    setResult(output);
    setRepresentation("tac");
    setGenerated(true);
    setError("");
    setStepIndex(0);

    setHistory((oldHistory) => {
      const updated = [
        expression.trim(),
        ...oldHistory.filter(
          (item) => item !== expression.trim()
        ),
      ];

      return updated.slice(0, 10);
    });

  } catch (err) {
    console.error(err);

    setError(
      "Backend connection failed. Make sure Spring Boot is running on port 8080."
    );

    setGenerated(false);
    setResult(null);
  }
};
  /* ================= COPY ================= */

 const handleCopy = async () => {
  if (!result) return;

  await navigator.clipboard.writeText(result.tac.join("\n"));

  setCopied(true);

  setTimeout(() => {
    setCopied(false);
  }, 2000);
};

  /* ================= DOWNLOAD ================= */

  const handleDownload = () => {
    if (!result) return;

    const content = result.tac.join("\n");

    const blob = new Blob([content], {
      type: "text/plain",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "three-address-code.txt";
    a.click();

    URL.revokeObjectURL(url);
  };

  /* ================= CLEAR HISTORY ================= */

  const clearHistory = () => {
    setHistory([]);
  };

  return (
    <>
      {/* HEADER */}

      <header className="site-header">
        <div className="header-inner">
          <h1>Three Address Code Generator</h1>

          <p className="subtitle">
            Rule-Based Interactive Compiler Learning Tool
          </p>

          <p className="tagline">
            Generate it. See it. Understand it. Hear it.
          </p>
        </div>
      </header>

      <main className="container">

        {/* INPUT */}

        <section className="card">
          <h2>Enter Expression</h2>

          <div className="input-row">
            <input
              id="expr-input"
              type="text"
              placeholder="a = b + c * d"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleGenerate();
                }
              }}
            />

            <button
              className="btn btn-primary"
              onClick={handleGenerate}
            >
              Generate
            </button>
          </div>

          {error && (
            <div className="why-box" style={{ marginTop: "15px" }}>
              <h3>Error</h3>
              <p>{error}</p>
            </div>
          )}

          <div className="examples">
            <span className="examples-label">Examples:</span>

            <div className="chip-row">
              {EXAMPLES.map((item) => (
                <button
                  key={item}
                  className="chip"
                  onClick={() => {
                    setExpression(item);
                    setError("");
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="examples">
            <span className="examples-label">
              Try an error:
            </span>

            <div className="chip-row">
              {ERROR_EXAMPLES.map((item) => (
                <button
                  key={item}
                  className="chip chip-error"
                  onClick={() => {
                    setExpression(item);
                    setError("");
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* RESULTS */}

        {generated && (
  <>
    {/* REPRESENTATION MODES */}
    <section className="card">
      <h2>Representation</h2>

      <div className="mode-row">
        {[
          ["tac", "TAC"],
          ["quadruple", "Quadruple"],
          ["triple", "Triple"],
          ["indirect", "Indirect Triple"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={`btn mode-btn ${
              representation === value ? "active" : ""
            }`}
            onClick={() => {
  setRepresentation(value);
  setMode("quick");
  setStepIndex(0);
}}
          >
            {label}
          </button>
        ))}
      </div>
    </section>

    {/* LEARNING MODE */}
    <section className="card">
      <h2>Mode</h2>

              <div className="mode-row">
                {[
                  ["quick", "⚡ Quick"],
                  ["smart", "🧠 Smart"],
                  ["learn", "🎓 Learn"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={`btn mode-btn ${
                      mode === value ? "active" : ""
                    }`}
                   onClick={() => {
  setMode(value);
  setStepIndex(0);
}}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <p className="mode-hint">
                {MODE_HINTS[mode]}
              </p>
            </section>


            


            {/* TAC */}


            {/* OUTPUT */}

{/* TAC - always visible in Quick mode */}
<section className="card">
  <h2>Generated TAC</h2>

  <pre className="code-block">
    {result.tac.join("\n")}
  </pre>

  <div className="btn-row">
    <button
  className="btn"
 onClick={isSpeaking ? handleStopSpeak : handleSpeakTAC}
>
  {isSpeaking ? "⏹ Stop" : "🎙️ Listen"}
</button>

    <button className="btn" onClick={handleCopy}>
  {copied ? "✓ Copied" : "📋 Copy"}
</button>

    <button
      className="btn"
      onClick={handleDownload}
    >
      ⬇ Download
    </button>
  </div>
</section>


{/* QUADRUPLE */}
{representation === "quadruple" && (
  <section className="card">
    <h2>Quadruple</h2>

    <table className="output-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Operator</th>
          <th>Arg1</th>
          <th>Arg2</th>
          <th>Result</th>
        </tr>
      </thead>

      <tbody>
        {buildQuadruples(result.tac).map((item) => (
          <tr key={item.index}>
            <td>{item.index}</td>
            <td>{item.operator}</td>
            <td>{item.arg1}</td>
            <td>{item.arg2}</td>
            <td>{item.result}</td>
          </tr>
        ))}
      </tbody>
    </table>
    
  </section>
)}

{/* TRIPLE */}
{representation === "triple" && (
  <section className="card">
    <h2>Triple</h2>

    <table className="output-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Operator</th>
          <th>Arg1</th>
          <th>Arg2</th>
        </tr>
      </thead>

      <tbody>
        {buildTriples(result.tac).map((item) => (
          <tr key={item.index}>
            <td>{item.index}</td>
            <td>{item.operator}</td>
            <td>{item.arg1}</td>
            <td>{item.arg2}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
)}

{/* INDIRECT TRIPLE */}
{representation === "indirect" && (
  <section className="card">
    <h2>Indirect Triple</h2>

    <h3>Triple Table</h3>

    <table className="output-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Operator</th>
          <th>Arg1</th>
          <th>Arg2</th>
        </tr>
      </thead>

      <tbody>
        {buildIndirectTriples(result.tac).triples.map((item) => (
          <tr key={item.index}>
            <td>{item.index}</td>
            <td>{item.operator}</td>
            <td>{item.arg1}</td>
            <td>{item.arg2}</td>
          </tr>
        ))}
      </tbody>
    </table>

    <h3>Pointer Table</h3>

    <table className="output-table">
      <thead>
        <tr>
          <th>Pointer</th>
          <th>Triple</th>
        </tr>
      </thead>

      <tbody>
        {buildIndirectTriples(result.tac).pointers.map((item) => (
          <tr key={item.pointer}>
            <td>{item.pointer}</td>
            <td>{item.triple}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
)}
{/* SMART EXPLANATION */}

{mode === "smart" && representation !== "tac" && (
  <section className="card">
    <div className="steps-header">
  <h2>💡 Smart Explanation</h2>

  
</div>

    {representation === "quadruple" && (
      <p>
        <strong>Quadruple</strong> represents each instruction using
        four fields: Operator, Arg1, Arg2, and Result.
        The temporary variables such as t1 and t2 store intermediate results.
      </p>
    )}

    {representation === "triple" && (
      <p>
        <strong>Triple</strong> represents instructions using an index,
        Operator, Arg1, and Arg2. Previous results are referred to
        using their index, such as (0) or (1), instead of temporary names.
      </p>
    )}

    {representation === "indirect" && (
      <p>
        <strong>Indirect Triple</strong> uses the Triple representation
        together with a Pointer Table. The pointer table refers to
        triple entries by their index.
      </p>
    )}
  </section>
)}

{/* LEARN EXPLANATION */}

{mode === "learn" && representation !== "tac" && (
  <section className="card">
    <div className="steps-header">
  <h2>📚 Learn</h2>

  
</div>

    {representation === "quadruple" && (
      <>
        <h3>What is Quadruple?</h3>
        <p>
          Quadruple represents each Three Address Code instruction
          using four fields: Operator, Arg1, Arg2, and Result.
        </p>

        <h3>How to read the table</h3>
        <p>
          <strong>Operator:</strong> The operation being performed.
        </p>
        <p>
          <strong>Arg1:</strong> The first operand.
        </p>
        <p>
          <strong>Arg2:</strong> The second operand.
        </p>
        <p>
          <strong>Result:</strong> Where the operation result is stored.
        </p>

        <h3>Example</h3>
        <p>
          For <strong>t1 = c * d</strong>, the operator is *,
          the arguments are c and d, and the result is stored in t1.
        </p>
      </>
    )}

    {representation === "triple" && (
      <>
        <h3>What is Triple?</h3>
        <p>
          Triple represents each instruction using an index,
          Operator, Arg1, and Arg2. Temporary variable names are
          replaced by references to instruction numbers.
        </p>

        <h3>How to read the table</h3>
        <p>
          <strong>#:</strong> The instruction number.
        </p>
        <p>
          <strong>Operator:</strong> The operation being performed.
        </p>
        <p>
          <strong>Arg1 / Arg2:</strong> The operands used by the operation.
        </p>

        <h3>What does (0) mean?</h3>
        <p>
          (0) refers to the result produced by Triple instruction 0.
          Similarly, (1) refers to instruction 1.
        </p>
      </>
    )}

    {representation === "indirect" && (
      <>
        <h3>What is Indirect Triple?</h3>
        <p>
          Indirect Triple uses a Triple table together with a
          Pointer Table. The pointer table points to the corresponding
          Triple instructions.
        </p>

        <h3>How to read the tables</h3>
        <p>
          The <strong>Triple Table</strong> contains the actual operations.
        </p>
        <p>
          The <strong>Pointer Table</strong> contains references to
          the Triple entries.
        </p>

        <h3>Why use pointers?</h3>
        <p>
          Instead of directly changing the Triple entries,
          the pointer table can be used to refer to them.
        </p>
      </>
    )}
  </section>
)}
            {/* SMART */}

            {(mode === "smart" || mode === "learn") && (
              <section className="card">
                <div className="steps-header">
                  <h2>
                    Step {stepIndex + 1} of{" "}
                    {result.steps.length}
                  </h2>

                  <div className="btn-row">
                    <button
                      className="btn"
                      disabled={stepIndex === 0}
                      onClick={() => {
  window.speechSynthesis.cancel();
  setIsSpeaking(false);
  setStepIndex((i) => Math.max(0, i - 1));
}}
                    >
                      ◀ Previous
                    </button>

                    <button
                      className="btn"
                      disabled={
                        stepIndex === result.steps.length - 1
                      }
                      onClick={() => {
  window.speechSynthesis.cancel();
  setIsSpeaking(false);
  setStepIndex((i) =>
    Math.min(
      result.steps.length - 1,
      i + 1
    )
  );
}}
                    >
                      Next ▶
                    </button>

                   
                  </div>
                </div>

                <p className="step-expression">
                  {expression}
                </p>

                <p className="step-generated">
                  → {result.steps[stepIndex].generated}
                </p>

                <div className="why-box">
                  <h3>Why?</h3>

                  <p>
                    {result.steps[stepIndex].reason}
                  </p>
                </div>
              </section>
            )}

            {/* LEARN */}

            {mode === "learn" && (
              <>
                <section className="card">
                  <h2>🎓 Learn: How the compiler thinks</h2>

                  <ol className="pipeline">

                    <li>
                      <h3>1 · Tokens</h3>

                      <p className="pipeline-note">
                        The tokenizer splits the input into meaningful pieces.
                      </p>

                      <div className="token-list">
                        {result.tokens.map((token, index) => (
                          <span
                            className="token-pill"
                            key={index}
                          >
                            <b>{token.type}</b>{" "}
                            {token.value}
                          </span>
                        ))}
                      </div>
                    </li>

                    <li>
                      <h3>2 · Precedence</h3>

                      <p className="pipeline-note">
                        unary − → * / % → + − → =
                        <br />
                        Higher rules are evaluated first.
                      </p>
                    </li>

                    <li>
                      <h3>3 · Expression Structure</h3>

                      <p className="pipeline-note">
                        The parser builds a tree — deepest
                        nodes are computed first.
                      </p>
                    </li>

                    <li>
                      <h3>4 · Temporary Variables</h3>

                      <p className="pipeline-note">
                        Each operation stores its result in
                        t1, t2, t3 …
                      </p>
                    </li>

                    <li>
                      <h3>5 · Substitution</h3>

                      <p className="pipeline-note">
                        Later steps use temporaries instead
                        of original sub-expressions.
                      </p>
                    </li>

                    <li>
                      <h3>6 · Final TAC</h3>

                      <p className="pipeline-note">
                        The last temporary is assigned to
                        the left-hand variable.
                      </p>
                    </li>

                  </ol>
                </section>

                {/* TREE */}

                <section className="card">
                  <h2>Expression Tree</h2>

                  <div className="tree-container">
                    <div className="simple-tree">
                      <div className="tree-node">=</div>

                      <div className="tree-children">
                        <div className="tree-node">
                          {expression.split("=")[0]?.trim()}
                        </div>

                        <TreeNode node={result.tree} />
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {/* HISTORY */}


      {/* HISTORY */}

<div className="history-toggle">
  <button
    className="btn"
    onClick={() => setShowHistory(!showHistory)}
  >
    📜 History
  </button>
</div>

{showHistory && (
  <section className="card">
    <div className="history-header">
      <h2>Recent Expressions</h2>

      <button
        className="btn btn-small"
        onClick={clearHistory}
      >
        Clear
      </button>
    </div>

    <ol className="history-list">
      {history.length === 0 ? (
        <li>No expressions yet.</li>
      ) : (
        history.map((item, index) => (
          <li
            key={`${item}-${index}`}
            onClick={() => setExpression(item)}
            style={{ cursor: "pointer" }}
          >
            {item}
          </li>
        ))
      )}
    </ol>
  </section>
)}

      </main>

      <footer className="site-footer">
        <p>
          Prototype · Phase 1 · The real Java + Spring Boot
          compiler arrives in Phase 2.
        </p>
      </footer>
    </>   
  );
}

export default App;
// .\mvnw.cmd spring-boot:run
