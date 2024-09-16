import ts from "typescript";
import path from "path";
import fs from "fs";
import importedJson from "./config.json";
enum TS_TYPES {
  STRING_LITERAL = "literal",
  FUNCTION = "function",
  USER_DEFINED_TYPE = "user_defined_type",
  VARIABLE = "variable",
  ENUM = "enum",
}
function getEnclosingScope(node: ts.Node): string {
  let currentScope: string | null = null;

  while (node) {
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
      currentScope = node.name?.getText() || "anonymous function";
      break;
    } else if (ts.isClassDeclaration(node)) {
      currentScope = node.name?.getText() || "anonymous class";
      break;
    } else if (ts.isSourceFile(node)) {
      currentScope = "global"; // Reached the root of the file
      break;
    }

    node = node.parent; // Move to the parent node
  }

  return currentScope || "unknown"; // Handle cases where no clear scope is found
}

const containsStringAndObtainType = (node: ts.Node, searchString: string) => {
  let containsString = false;
  let type: string | null = null;
  if (ts.isStringLiteral(node)) {
    type = TS_TYPES.STRING_LITERAL;
    containsString = node.getFullText().includes(searchString);
  }
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isClassDeclaration(node)
  ) {
    type === TS_TYPES.FUNCTION;
    containsString = node.getSourceFile().getFullText().includes(searchString);
  }
  if (ts.isTypeReferenceNode(node)) {
    type = TS_TYPES.USER_DEFINED_TYPE;
    containsString = node.getSourceFile().getFullText().includes(searchString);
  }
  if (ts.isVariableDeclaration(node)) {
    type = TS_TYPES.VARIABLE;
    containsString = node.getSourceFile().getFullText().includes(searchString);
  }

  if (ts.isEnumDeclaration(node)) {
    type = TS_TYPES.ENUM;
    containsString = node.getSourceFile().getFullText().includes(searchString);
  }
  return {
    type,
    containsString,
    text: containsString
      ? node
          .getSourceFile()
          .getFullText()
          .substring(node.getStart(), node.getEnd())
      : undefined,
  };
};

function visitNode(
  node: ts.Node,
  results: any[],
  targetString,
  sourceFile: ts.SourceFile
) {
  let enclosingScope: string | null | undefined = undefined;
  if (
    sourceFile.fileName.endsWith(".ts") ||
    sourceFile.fileName.endsWith(".tsx")
  ) {
    const { type, containsString, text } = containsStringAndObtainType(
      node,
      targetString
    );

    if (type === TS_TYPES.STRING_LITERAL) {
      if (sourceFile.getFullText().includes(targetString)) {
        enclosingScope = node.getText();
      }
    }

    if (type === TS_TYPES.FUNCTION) {
      if (node.parent) {
        let parent = node.parent;
        while (parent) {
          if (
            ts.isFunctionDeclaration(parent) ||
            ts.isArrowFunction(parent) ||
            ts.isClassDeclaration(parent)
          ) {
            enclosingScope = parent.name ? parent.name.text : "anonymous";
            break;
          }
        }
      }
      if (sourceFile.getFullText().includes(targetString))
        enclosingScope = node.parent.getText();
    }
    if (type === TS_TYPES.USER_DEFINED_TYPE) {
      if (sourceFile.getFullText().includes(targetString))
        enclosingScope = node.parent.getText();
    }

    if (sourceFile.getFullText().includes(targetString)) {
      results.push({
        filePath: node.getSourceFile().fileName,
        lineNumber:
          node
            .getSourceFile()
            .getLineAndCharacterOfPosition(
              node.getSourceFile().text.indexOf(targetString)
            ).line + 1,
        type: ts.SyntaxKind[node.kind],
        text: text,
        enclosingScope: enclosingScope ?? getEnclosingScope(node),
      });
    }
  }
  if (node.getChildCount() > 0) {
    node.forEachChild((node) =>
      visitNode(node, results, targetString, sourceFile)
    );
  }
}

function obtainFilePaths(rootDirectory: string): string[] {
  const filePaths: string[] = [];

  function traverseDirectory(directoryPath: string) {
    const entries = fs.readdirSync(directoryPath);

    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry);
      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        if (fullPath.includes("node_modules")) continue;
        else traverseDirectory(fullPath);
      } else if (stats.isFile()) {
        filePaths.push(fullPath);
      }
    }
  }

  traverseDirectory(rootDirectory);
  return filePaths;
}

const findStringUsages = (
  targetString: string,
  rootDirectory: string
): {
  filePath: string;
  lineNumber: string;
  type: string;
  enclosingScope: string;
}[] => {
  const allFilesPaths = obtainFilePaths(rootDirectory);
  const results: any[] = [];
  for (const filePath of allFilesPaths) {
    const sourceFile = ts.createSourceFile(
      filePath,
      fs.readFileSync(filePath).toString(),
      ts.ScriptTarget.Latest,
      true
    );
    sourceFile.forEachChild((node) =>
      visitNode(node, results, targetString, sourceFile)
    );
  }
  return results;
};
function writeToFile(filePath, content, options = {}) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    `${filePath}/${new Date(Date.now()).toDateString()}`,
    content,
    options
  );
}
const targetString = importedJson["targetString"] ?? "";
const targetFile = importedJson["targetFile"] ?? "";
const directoryToReadFrom = importedJson["directoryToReadFrom"] ?? "";
const stringUsages = findStringUsages(targetString, directoryToReadFrom);
writeToFile(
  targetFile,
  JSON.stringify(
    stringUsages.reduce((previous: { [key: string]: any }, current) => {
      if (!previous[current.filePath]) {
        previous[current.filePath] = {
          lineNumber: [current.lineNumber],
          type: [current.type],
          enclosingScope: [current.enclosingScope],
        };
      }
      previous[current.filePath] = {
        lineNumber: [
          ...previous[current.filePath].lineNumber,
          current.lineNumber,
        ],
        enclosingScope: [
          ...previous[current.filePath].enclosingScope,
          current.enclosingScope,
        ].reduce((prev, curr) => {
          if (prev.indexOf(curr) === -1) {
            return [...prev, curr];
          } else {
            return prev;
          }
        }, []),
        type: [...previous[current.filePath].type, current.type],
      };
      return previous;
    }, {}),
    null,
    2
  )
);
