"use strict";

let viz = new Viz({ workerURL: 'lite.render.js' });
let input = "";
let input_elm;
let output_text;
let output_svg;
let states = [];
let automata = [];
let edges = [];

class Edge {
    // from: 遷移元状態id
    // to: 遷移先状態id
    // input: この遷移が発生する入力
    constructor(from, to, input) {
        this.from = from;
        this.to = to;
        this.input = input;
    }
}

class State {
    // edges: この状態が関わる遷移のid
    constructor() {
        this.edges = new Set();
    }
}

class Automaton {
    // initial: 初期状態の番号
    // final: 最終状態の番号
    constructor(initial, final) {
        this.initial = initial;
        this.final = final;
    }
}

window.addEventListener("load", function () {
    input_elm = this.document.getElementsByName("regexp")[0];
    output_text = this.document.getElementById("graphviz-source");
    output_svg = this.document.getElementById("graphviz-rendered");
    window.setInterval(mainloop, 500);
});

function mainloop() {
    if (input_elm.value != input) {
        input = input_elm.value;
        let automaton = parse(input);
        if (automaton != -1) {
            let dottext = automaton_to_string(automaton);
            output_text.value = dottext;
            output_svg.childNodes.forEach((e) => e.remove());
            output_svg.appendChild(graph(dottext));
        }
    }
}

// 入力input、状態fromからtoへの新しい遷移を生成してそのidを返す
// この関数は遷移に関係するStateを書き換える
function create_edge(from, to, input) {
    let id = edges.length;
    edges.push(new Edge(from, to, input));
    states[from].edges.add(id);
    states[to].edges.add(id);
    return id;
}

// 新しい状態を生成してそのidを返す
function alloc_state() {
    let id = states.length;
    states.push(new State());
    return id;
}

// 新しいオートマトンを生成してそのidを返す
function create_automaton(initial, final) {
    let id = automata.length;
    automata.push(new Automaton(initial, final));
    return id;
}

// 2つの状態のidを受け取りそれらをマージした新しい状態を返す
// マージした遷移と状態は削除される
// マージした後の状態が状態として正しいものになることは呼び出し側が保証する
function merge_state(a, b) {
    if (a == b)
        return a;
    let eb = states[b].edges.values();
    for (const eid of eb) {
        let edge = edges[eid];
        if (edge.from == edge.to) {
            create_edge(a, a, edge.input);
        } else if (edge.to == b) {
            states[edge.from].edges.delete(eid);
            create_edge(edge.from, a, edge.input);
        } else {
            states[edge.to].edges.delete(eid);
            create_edge(a, edge.to, edge.input);
        }
    }
    return a;
}

// 状態idを受け取り、その状態が自己ループを持つか判定して返す
function has_self_loop(sid) {
    for (const eid of states[sid].edges.values()) {
        let edge = edges[eid];
        if (edge.from == edge.to)
            return true;
    }
    return false;
}

// 状態idを受け取り、その状態に入る遷移が存在するか判定して返す
function has_in(sid) {
    for (const eid of states[sid].edges.values()) {
        let edge = edges[eid];
        if (edge.to == sid)
            return true;
    }
    return false;
}
// 状態idを受け取り、その状態が出る遷移を持つか判定して返す
function has_out(sid) {
    for (const eid of states[sid].edges.values()) {
        let edge = edges[eid];
        if (edge.from == sid)
            return true;
    }
    return false;
}

// ある1文字cにマッチするオートマトンを作りidを返す
function create_factor(c) {
    let from = alloc_state();
    let to = alloc_state();
    create_edge(from, to, c);
    let a = create_automaton(from, to);
    return a;
}

// 2つのオートマトンを受け取りその連接を表すオートマトンを作り、そのidを返す
function create_concatnation(lhs, rhs) {
    let al = automata[lhs];
    let ar = automata[rhs];
    if (has_in(al.initial) || has_out(ar.final)) {
        create_edge(al.final, ar.initial, 'ε');
        return create_automaton(al.initial, ar.final);
    }
    else {
        merge_state(al.final, ar.initial);
        return create_automaton(al.initial, ar.final);
    }
}
// オートマトンを受け取りその閉包を表すオートマトンを作り、そのidを返す
function create_closure(id) {
    let a = automata[id];
    if (has_in(a.initial) || has_out(a.final)) {
        let v = alloc_state();
        create_edge(v, a.initial, 'ε');
        create_edge(a.final, v, 'ε');
        return create_automaton(v, v);
    } else {
        let v = merge_state(a.initial, a.final);
        return create_automaton(v, v);
    }
}
// 2つのオートマトンを受け取りその和を表すオートマトンを作り、そのidを返す
function create_or(lhs, rhs) {
    let al = automata[lhs];
    let ar = automata[rhs];
    let initial = alloc_state();
    let final = alloc_state();
    if (!has_in(al.initial)) {
        initial = merge_state(initial, al.initial);
    } else {
        create_edge(initial, al.initial, "ε");
    }

    if (!has_in(ar.initial)) {
        initial = merge_state(initial, ar.initial);
    }
    else {
        create_edge(initial, ar.initial, "ε");
    }

    if (!has_out(al.final)) {
        final = merge_state(final, al.final);
    }
    else {
        create_edge(al.final, final, "ε");
    }
    
    if (!has_out(ar.final)) {
        final = merge_state(final, ar.final);
    }
    else {
        create_edge(ar.final, final, "ε");
    }
    return create_automaton(initial, final);
}

// 文字列からオートマトンを作りidを返す
// states,automata,edgesはこれを呼ぶと初期化される
// パースエラーが起きた場合-1を返す
function parse(str) {
    if (str.length == 0) {
        let s = alloc_state();
        return create_automaton(s, s);
    }
    states = [];
    automata = [];
    edges = [];
    let i = 0;
    // 最も優先順位の低い和の演算子+をパースしてオートマトンidを返す
    // この関数の実行後、iは+演算子の直後の文字(正規表現の最後または閉じカッコ)のインデックスを指す
    function parse_or() {
        let lhs = parse_term();
        if (lhs == -1) { console.log("-1"); return -1; }
        while (str[i] == '+') {
            i++; // skip +
            let rhs = parse_term();
            if (rhs == -1) { console.log("-1"); return -1; }
            lhs = create_or(lhs, rhs);
        }
        return lhs;
    }
    // 単項式をパースしてオートマトンidを返す
    // この関数の実行後、iは+演算子の直後の文字のインデックスを指す
    function parse_term() {
        let lhs = parse_closure();
        if (lhs == -1) { console.log("-1"); return -1; }
        while (str[i] != '+' && str[i] != ')' && i < str.length) {
            let rhs = parse_closure();
            if (rhs == -1) { console.log("-1"); return -1; }
            lhs = create_concatnation(lhs, rhs);
        }
        return lhs;
    }
    // 閉包演算子*をパースしてオートマトンidを返す
    // この関数の実行後、iは+演算子の直後の文字のインデックスを指す
    function parse_closure() {
        let term = parse_factor();
        if (term == -1) { console.log("-1"); return -1; }
        while (str[i] == '*') {
            i++; // skip *
            term = create_closure(term);
            if (term == -1) { console.log("-1"); return -1; }
        }
        return term;
    }

    //文字やカッコをパースしてオートマトンidを返す
    function parse_factor() {
        if (str[i] == '(') {
            i++; // skip (
            let expr = parse_or();
            if (str[i] != ')') { console.log("-1"); return -1; }
            i++; // skip )
            return expr;
        }
        if (str[i] != '+' && str[i] != '*') {
            return create_factor(str[i++]);
        }
        { console.log("-1"); return -1; }
    }
    return parse_or();
}

// オートマトンaを受け取りgraphvizのコードを返す
function automaton_to_string(a) {
    let ret = "digraph { graph [rankdir=LR];";
    let visited = new Set();
    let queue = [];
    let label_id = 0;
    queue.push(automata[a].initial);
    while (queue.length != 0) {
        let sid = queue.pop();
        if (visited.has(sid))
            continue;
        visited.add(sid);
        ret += 'v' + sid + '[label="q' + label_id++ + '"';
        ret += ' shape=' + ((sid == automata[a].final) ? 'doublecircle' : 'circle') + '];';
        let map = new Map();
        for (const eid of states[sid].edges.values())
            if (edges[eid].from == sid) {
                let to = edges[eid].to;
                let s;
                queue.push(to);
                if (map.has(to)) {
                    s = map.get(to);
                    s.add(edges[eid].input);
                }
                else {
                    s = new Set();
                    s.add(edges[eid].input);
                }
                map.set(to, s);
            }
        for (const to of map.keys()) {
            ret += 'v' + sid + ' -> v' + to + ' [label="';
            ret += Array.from(map.get(to).values()).join();
            ret += '"];';
        }
    }
    ret += "}";
    return ret;
}

// graphvizのコードを受け取りレンダリング結果の入ったdiv要素を返す
function graph(str) {
    let div = document.createElement("div");
    div.className = "graph";
    viz.renderSVGElement(str)
        .then(function (element) {
            div.appendChild(element);
        });
    return div;
}