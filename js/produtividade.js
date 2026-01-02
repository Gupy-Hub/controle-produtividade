// js/produtividade.js
// - Baseado no arquivo original enviado

let dadosGlobais = [];
let metasGlobais = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Obtém a data global sincronizada
    const dataAtual = DataGlobal.obter(); // Retorna DD/MM/AAAA
    
    // 2. Preenche o input
    const inputDia = document.getElementById('select-dia');
    if(inputDia) inputDia.value = dataAtual;
    
    // 3. Define o seletor de mês baseado nessa data
    if(dataAtual && dataAtual.length === 10) {
        const [dia, mes, ano] = dataAtual.split('/');
        document.getElementById('select-mes').value = `${ano}-${mes}`;
    }

    ajustarSeletores(); 
});

function ajustarSeletores() {
    const view = document.getElementById('view-selector').value;
    const d = document.getElementById('select-dia'), m = document.getElementById('select-mes'), s = document.getElementById('select-semana');
    
    d.classList.add('hidden'); m.classList.add('hidden'); s.classList.add('hidden');
    
    if (view === 'dia') {
        d.classList.remove('hidden');
    }
    else if (view === 'semana') { 
        m.classList.remove('hidden'); 
        s.classList.remove('hidden'); 
        // Sincroniza mês se necessário
        if(d.value && d.value.length === 10 && !m.value) {
             const [dia, mes, ano] = d.value.split('/');
             m.value = `${ano}-${mes}`;
        }
    }
    else { 
        m.classList.remove('hidden'); 
        if(d.value && d.value.length === 10 && !m.value) {
             const [dia, mes, ano] = d.value.split('/');
             m.value = `${ano}-${mes}`;
        }
    }
    carregarDados();
}

function getWeek(dateString) { const date = new Date(dateString + 'T12:00:00'); const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay(); return Math.ceil((date.getDate() + firstDay) / 7); }

async function carregarDados() {
    const view = document.getElementById('view-selector').value;
    let dataInicio, dataFim, titulo, semanaSel;

    if (view === 'dia') {
        const diaVisual = document.getElementById('select-dia').value; 
        if(!diaVisual || diaVisual.length !== 10) return;
        
        // Atualiza a global se alterado manualmente aqui
        DataGlobal.definir(diaVisual);

        const diaISO = DataGlobal.paraISO(diaVisual);
        dataInicio = diaISO; 
        dataFim = diaISO; 
        titulo = `Visão do Dia: ${diaVisual}`;
    } else {
        const mes = document.getElementById('select-mes').value; if(!mes) return;
        dataInicio = `${mes}-01`; const [ano, m] = mes.split('-'); const ultimoDia = new Date(ano, m, 0).getDate(); dataFim = `${mes}-${ultimoDia}`;
        if (view === 'semana') { semanaSel = parseInt(document.getElementById('select-semana').value); titulo = `Visão: Semana ${semanaSel} de ${mes.split('-').reverse().join('/')}`; }
        else { titulo = `Visão Mensal: ${mes}`; }
    }
    
    document.getElementById('panel-titulo').innerText = "A carregar..."; document.getElementById('tabela-corpo').innerHTML = '<tr><td colspan="7" class="text-center py-8">A carregar dados...</td></tr>';
    
    try {
        const { data: p, error: eP } = await _supabase.from('producao').select('*, usuarios(*)').gte('data_referencia', dataInicio).lte('data_referencia', dataFim);
        if (eP) throw eP;
        const { data: m, error: eM } = await _supabase.from('metas').select('*'); if (eM) throw eM;
        dadosGlobais = p || []; metasGlobais = m || [];
        if (view === 'semana') dadosGlobais = dadosGlobais.filter(d => getWeek(d.data_referencia) === semanaSel);
        renderizarTabela(titulo);
    } catch (err) { console.error(err); alert("Erro ao carregar dados."); }
}

function renderizarTabela(titulo) {
    document.getElementById('panel-titulo').innerText = titulo;
    let stats = {};
    dadosGlobais.forEach(item => {
        if (!item.usuarios || item.usuarios.funcao !== 'Assistente') return;
        const uid = item.usuario_id;
        const qtdTotal = (item.quantidade || 0); 

        if (!stats[uid]) stats[uid] = { id: uid, nome: item.usuarios.nome, total: 0, fifo: 0, gt: 0, gp: 0, dias: new Set() };
        stats[uid].total += qtdTotal;
        stats[uid].fifo += (item.fifo || 0);
        stats[uid].gt += (item.gradual_total || 0);
        stats[uid].gp += (item.gradual_parcial || 0);
        stats[uid].dias.add(item.data_referencia);
    });
    const lista = Object.values(stats).sort((a, b) => b.total - a.total);
    const total = lista.reduce((a, b) => a + b.total, 0);
    document.getElementById('p-total').innerText = total.toLocaleString();
    document.getElementById('p-media').innerText = lista.length ? Math.round(total / lista.length).toLocaleString() : 0;
    document.getElementById('p-headcount').innerText = lista.length;
    const tbody = document.getElementById('tabela-corpo');
    if (!lista.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-500">Nenhum registo encontrado.</td></tr>'; return; }
    let html = '';
    lista.forEach(u => {
        const diasTrab = u.dias.size || 1; const meta = 650 * diasTrab; const atingiu = u.total >= meta; const badge = atingiu ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800';
        html += `<tr class="hover:bg-slate-50 transition border-b border-slate-100"><td class="px-6 py-4 font-medium text-slate-900">${u.nome}</td><td class="px-6 py-4 text-center font-bold text-blue-700">${u.total.toLocaleString()}</td><td class="px-6 py-4 text-center">${u.fifo}</td><td class="px-6 py-4 text-center">${u.gt}</td><td class="px-6 py-4 text-center">${u.gp}</td><td class="px-6 py-4 text-center text-slate-400">${meta.toLocaleString()}</td><td class="px-6 py-4 text-center"><span class="${badge} text-xs font-bold px-2 py-1 rounded-full">${atingiu ? 'Atingida' : 'Abaixo'}</span></td></tr>`;
    });
    tbody.innerHTML = html;
}

async function importarArquivos() {
    const files = document.getElementById('excel-files').files; if (files.length === 0) return;
    const btn = document.getElementById('btn-import'); const originalText = btn.innerHTML; btn.innerHTML = '⏳ Processando...'; btn.disabled = true;
    let log = { ok: 0, dup: 0, err: 0 };
    for (let f of files) {
        try {
            const name = f.name.replace('.xlsx', ''); if (!/^\d{8}$/.test(name)) { log.err++; continue; }
            const dataRef = `${name.substring(0, 4)}-${name.substring(4, 6)}-${name.substring(6, 8)}`;
            const buffer = await f.arrayBuffer(); const wb = XLSX.read(buffer, { type: 'array' }); const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            for (let row of json) {
                if (!row.id_assistente) continue;
                const { data: exists } = await _supabase.from('producao').select('id').eq('usuario_id', row.id_assistente).eq('data_referencia', dataRef).maybeSingle();
                if (exists) { log.dup++; } else {
                    await _supabase.from('producao').insert({ usuario_id: row.id_assistente, data_referencia: dataRef, fifo: row.documentos_validados_fifo || 0, gradual_total: row.documentos_validados_gradual_total || 0, gradual_parcial: row.documentos_validados_gradual_parcial || 0, perfil_fc: row.documentos_validados_perfil_fc || 0, quantidade: row.documentos_validados || 0 }); log.ok++;
                }
            }
        } catch (e) { console.error(e); log.err++; }
    }
    alert(`Fim da Importação!\n✅ Sucesso: ${log.ok}\n⚠️ Duplicados: ${log.dup}\n❌ Erros: ${log.err}`);
    btn.innerHTML = originalText; btn.disabled = false; document.getElementById('excel-files').value = ""; carregarDados();
}