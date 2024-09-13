import ts from "typescript";
import path from "path";
import fs from "fs";
import importedJson from "./config.json";
function visitNode(node: ts.Node, results: any[], targetString) {
  let enclosingScope: string | null | undefined = undefined;

  if (
    node.getSourceFile().fileName.endsWith("test.ts") ||
    node.getSourceFile().fileName.endsWith(".ts")
  ) {
    if (
      ts.isStringLiteral(node) &&
      node.getSourceFile().text.includes(targetString)
    ) {
      enclosingScope = null;
    }
    if (ts.isVariableDeclaration(node)) {
      enclosingScope = "root";
    }

    let parent = node.parent;

    if (parent) {
      do {
        if (
          ts.isFunctionDeclaration(parent) ||
          ts.isArrowFunction(parent) ||
          ts.isClassDeclaration(parent)
        ) {
          console.log("### IS FUNCTION< ARROW< OR CLASS");
          enclosingScope = parent.name ? parent.name.text : "anonymous";
          break;
        }
        parent = parent.parent;
      } while (parent);
    }
    if (ts.isEnumDeclaration(node)) {
      enclosingScope = "enum";
    }

    if (node.getSourceFile().text.includes(targetString))
      results.push({
        filePath: node.getSourceFile().fileName,
        lineNumber:
          node
            .getSourceFile()
            .getLineAndCharacterOfPosition(
              node.getSourceFile().text.indexOf(targetString)
            ).line + 1,
        enclosingScope: enclosingScope,
      });

    results.concat(
      ts.forEachChild(node, (node) => visitNode(node, results, targetString))
    );
  }
  return results;
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

const findStringUsages = (targetString: string, rootDirectory: string) => {
  const allFilesPaths = obtainFilePaths(rootDirectory);
  const results: any[] = [];
  for (const filePath of allFilesPaths) {
    const sourceFile = ts.createSourceFile(
      filePath,
      fs.readFileSync(filePath).toString(),
      ts.ScriptTarget.Latest,
      true
    );
    ts.forEachChild(sourceFile.statements[0], (node) =>
      visitNode(node, results, targetString)
    );
  }
  return results;
};
function writeToFile(filePath, content, options = {}) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, options);
}
const targetString = importedJson["targetString"] ?? "";
const targetFile = importedJson["targetFile"] ?? "";
const directoryToReadFrom = importedJson["directoryToReadFrom"] ?? "";
const stringUsages = findStringUsages(targetString, directoryToReadFrom);
writeToFile(targetFile, JSON.stringify(stringUsages, null, 2));
