// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

interface Dic {
    [key: string]: string[] | null;
}

let word_list_global: Dic = {};
// let word_list_current: string[] = [];
let head_words: string[] = [];
let tail_words: string[] = [];
let matching: string[] = [];
let last_choice: string = '';
let orig_query: string = '';
let lookup_index: number = 0;

let case_separator = /([A-Z])?([^A-Z]*)/g;
let word_pattern = /(?<word>\$?\w+)/gm;

async function modify_global_word_list(doc: vscode.TextDocument) {

	let words =  doc.getText().match(word_pattern);
	word_list_global[doc.fileName] = [...new Set(words)];		
}

async function modify_current_word_list(editor: vscode.TextEditor) {

	let cursor = editor.selection.active;
	let head_range = new vscode.Range(new vscode.Position(0, 0), cursor);
	let head_text = editor.document.getText(head_range);
	head_words = head_text.match(word_pattern)!.reverse();
	head_words = [...new Set(head_words)];

	var last_line = new vscode.Position(editor.document.lineCount - 1, 100);
	let tail_range = new vscode.Range(cursor, last_line);
	let tail_text = editor.document.getText(tail_range);
	tail_words = tail_text.match(word_pattern)!;
	tail_words = [...new Set(tail_words)];
}


function did_match(candidate_word: string, query: string) {
	// if (candidate_word[0] !== query[0])
		// return false;
	const candidateWordLower = candidate_word.toLowerCase()
	const queryLower = query.toLowerCase()
	if (candidateWordLower.includes(queryLower)) {
		return(true);
	}
	if (query.length === 1)
		return false;

	// Word boundaries
	const cWords = candidate_word.match(/[A-Za-z][a-z]*|[0-9]+|[A-Z](?=[a-z])/g) || [];
	if (cWords.length <2) // Candidate now must be multi-subword word
		return false;
	

	const qWords = query.match(/[A-Za-z][a-z]*|[0-9]+|[A-Z](?=[a-z])/g) || [];
	const qWordslower = qWords.map(word => word.toLowerCase());
	
	if(qWordslower.every(subword => candidate_word.toLowerCase().includes(subword)))
	{
		return true;
	}

	return query.toLowerCase().split('').every(char => candidate_word.toLowerCase().includes(char))
}


function compare(a: string, b: string, query: string): number 
{
	if (a === b) return 0;
	
	const queryLower = query.toLowerCase();
	
	function calculateRank(str: string): number 
	{
		str = str.replace(/^\$/, ''); // remove $ sign (php)
		let rank = 0;
		const strLower = str.toLowerCase();
	

		// Prefix match boost
		if (strLower.startsWith(queryLower)) return rank + query.length * 3;

		// Exact match boost
		if (strLower.includes(queryLower)) return rank + query.length * 2;
	
		// Word boundaries
		const words = str.match(/[A-Za-z][a-z]*|[0-9]+|[A-Z](?=[a-z])/g) || [];
		const wordLowers = words.map(word => word.toLowerCase());
		for (const [i, char] of queryLower.split('').entries()) 
		{
			if (wordLowers[i]?.startsWith(char)) 
			{
				rank += query.length;
			}
		}
		return rank;
	}
	
	// Calculate ranks for both strings
	const aRank = calculateRank(a);
	const bRank = calculateRank(b);
	
	// Compare ranks
	return bRank - aRank;
	}

function hippee_ki_yay(editor: vscode.TextEditor, backward: boolean)
{
	const query_range = editor.document.getWordRangeAtPosition(editor.selection.active, /\w+/);
		if (!query_range) { return; }
		const query = editor.document.getText(query_range);

		if (query !== last_choice) 
		{
			orig_query = query;
			lookup_index = backward? -1:0; 
			matching = [];

			head_words.forEach(word => {
				if (word !== query && did_match(word, query)) // [ word[0].toLowerCase() === query[0].toLowerCase() ] not matching first char anymore --- could also add or  || word[0].toLowerCase() == '$'
				{
					matching.push(word);
				}
			});

			matching.sort((a, b) => compare(a, b, query)); // sort by rank
			
			let tail_matching: string[] = [];
			tail_words.forEach(word => {
				if (word !== query && did_match(word, query)) // [ word[0].toLowerCase() === query[0].toLowerCase() ] not matching first char anymore --- could also add or  || word[0].toLowerCase() == '$'
				{
					tail_matching.push(word);
				}
			});
			tail_matching.sort((a, b) => compare(a, b, query)); // sort by rank
			tail_matching.reverse()
			matching = matching.concat(tail_matching);

			if (matching.length === 0) {
				for (const w_list of Object.values(word_list_global)) {
					if (!w_list) { continue; }

					w_list.forEach(word => {
						if (!matching.includes(word) && word !== query && word[0].toLowerCase() === query[0].toLowerCase() && did_match(word, query)) 
						{
							matching.push(word);
						}
					});
				}
			}
			if (matching.length === 0) { return; }

		} else { lookup_index += backward? -1:+1; }

		if (lookup_index < 0) { lookup_index = matching.length+lookup_index; } // wrap around
		last_choice = matching[lookup_index]

		if (!last_choice)  // ran out of matches in current word list
		{ 
			lookup_index = 0;
			return;
			// TODO: get additional matches from global word list;
		}
		
	// replace query with choice
	editor.edit(edit => {// @ts-ignore
		editor.selections.forEach(selection => {// @ts-ignore
			const range = editor.document.getWordRangeAtPosition(selection.end);
			if (!range) { return; }
			edit.delete(range);
			edit.insert(range.end, last_choice);
		});
	});
}


export function activate(context: vscode.ExtensionContext) {


	let next = vscode.commands.registerCommand('hippie-completion.next', () => {
		let editor = vscode.window.activeTextEditor;
		if (!editor) { return; }
		hippee_ki_yay(editor, false);
	});
	context.subscriptions.push(next);


	let prev = vscode.commands.registerCommand('hippie-completion.prev', () => {
		let editor = vscode.window.activeTextEditor;
		if (!editor) { return; }
		hippee_ki_yay(editor, true);
	});
	context.subscriptions.push(prev);

	vscode.workspace.onDidChangeTextDocument((e) => {
		let editor = vscode.window.activeTextEditor;
		if (!editor) { return; }
		modify_current_word_list(editor);
	});
	
	vscode.workspace.onDidOpenTextDocument((doc) => {
		modify_global_word_list(doc);
		console.log("onDidOpenTextDocument: ", doc);
	});
	vscode.workspace.textDocuments.forEach((doc) => {
		modify_global_word_list(doc);
	});

}

// this method is called when your extension is deactivated
export function deactivate() { }
