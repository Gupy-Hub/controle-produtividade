// js/produtividade.js

// Variáveis globais
let dadosGlobais = [];
let metasGlobais = [];

document.addEventListener('DOMContentLoaded', () => {
    // Configura datas iniciais para 'Ontem'
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    
    // Define valores iniciais nos inputs
    const strHoje = ontem.toISOString().split('T')[0];
    const strMes = ontem.toISOString().substring(0, 7);

    document.getElementById('select-dia').value = strHoje;
    document.getElementById('select-mes').value = strMes;
    
    // Inicia a lógica
    ajustarSeletores(); 
});

// Controla visualização dos inputs (Dia/Semana/Mês)
function ajustarSeletores() {
    const view = document.getElementById('view-selector').value;
    const inputDia = document.getElementById('select-dia');
    const inputMes = document.getElementById('select-mes');
    const inputSemana = document.getElementById('select-semana');

    // Reset visual
    inputDia.classList.add('hidden');
    inputMes.classList.add('hidden');
    inputSemana.classList.add('hidden');

    if (view === 'dia') {
        inputDia.classList.remove('hidden');
    } else if (view === 'semana') {
        inputMes.classList.remove('hidden');
        inputSemana.classList.remove('hidden');
        if(inputDia.value) inputMes.value = inputDia.value.substring(0, 7);
    } else {
        inputMes.classList.remove('hidden');
        if(inputDia.value) inputMes.value = inputDia.value.substring(0, 7);
    }

    carregarDados();
}

// Função auxiliar para calcular o número da semana no mês
function getWeekNumber(dateString) { 
    const date = new Date(dateString + 'T12:00:00'); 
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay(); 
    return Math.ceil((date.getDate() + firstDay) / 7); 
}

// CARREGAMENTO OTIMIZADO (Promise.all)
async function carregarDados() {
    const view = document.getElementById('view-selector').value;
    
    let dataInicio, dataFim, titulo, semanaSel;
    
    // 1. Definir o intervalo de datas
    if (view === 'dia') {
        const dia = document.getElementById('select-dia').value;
        if (!dia) return;
        dataInicio = dia;
        dataFim = dia;
        titulo = `Visão do Dia: ${dia.split('-').reverse().join('/')}`;
    } else {
        const mes = document.getElementById('select-mes').value;
        if (!mes) return;
        
        dataInicio = `${mes}-01`;
        // Pega último dia do mês automaticamente
        const [ano, m] = mes.split('-');
        const ultimoDia = new Date(ano, m, 0).getDate();
        dataFim = `${mes}-${ultimoDia}`;

        if (view === 'semana') {
            semanaSel = parseInt(document.getElementById('select-semana').value);
            titulo = `Visão: Semana ${semanaSel} de ${mes.split('-').reverse().join('/')}`;
        } else {
            titulo = `Visão Mensal: ${mes}`;
        }
    }

    // Feedback visual
    document.getElementById('panel-titulo').innerText = "A carregar dados...";
    const tbody = document.getElementById('tabela-corpo');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 animate-pulse text-blue-600">A carregar informações...</td></tr>';

    try {
        // --- MELHORIA DE PERFORMANCE AQUI ---
        // Fazemos os dois pedidos ao banco de dados AO MESMO TEMPO
        const [resProducao, resMetas] = await Promise.all([
            _supabase
                .from('producao')
                .select('*, usuarios(id, nome, funcao)')
                .gte('data_referencia', dataInicio)
                .lte('data_referencia', dataFim),
            
            _supabase
                .from('metas')
                .select('*')
        ]);

        if (resProducao.error) throw resProducao.error;
        if (resMetas.error) throw resMetas.error;

        dadosGlobais = resProducao.data || [];
        metasGlobais = resMetas.data || [];

        // Filtro de semana (feito no JS pois é mais complexo fazer no SQL simples)
        if (view === 'semana') {
            dadosGlobais = dadosGlobais.filter(d => getWeekNumber(d.data_referencia) === semanaSel);
        }

        renderizarTabela(titulo);

    } catch (erro) {
        console.error(erro);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500 font-bold">Erro ao carregar dados. Verifique a conexão.</td></tr>';
    }
}

function renderizarTabela(tituloPainel) {
    document.getElementById('panel-titulo').innerText = tituloPainel;
    
    // Processamento dos dados
    let stats = {};

    dadosGlobais.forEach(item => {
        // Ignora quem não tem utilizador associado ou não é assistente
        if (!item.usuarios || item.usuarios.funcao !== 'Assistente') return;

        const uid = item.usuario_id;
        
        if (!stats[uid]) {
            stats[uid] = {
                id: uid,
                nome: item.usuarios.nome,
                total: 0,
                fifo: 0,
                gt: 0,
                gp: 0,
                diasTrabalhados: new Set() // Set guarda apenas valores únicos (datas únicas)
            };
        }

        // Soma os valores
        stats[uid].total += (item.quantidade || 0);
        stats[uid].fifo += (item.fifo || 0);
        stats[uid].gt += (item.gradual_total || 0);
        stats[uid].gp += (item.gradual_parcial || 0);
        stats[uid].diasTrabalhados.add(item.data_referencia);
    });

    // Transforma objeto em array e ordena (Maior produção primeiro)
    const lista = Object.values(stats).sort((a, b) => b.total - a.total);

    // Atualiza KPIs do topo
    const somaTotal = lista.reduce((acc, curr) => acc + curr.total, 0);
    const media = lista.length ? Math.round(somaTotal / lista.length) : 0;

    document.getElementById('p-total').innerText = somaTotal.toLocaleString();
    document.getElementById('p-media').innerText = media.toLocaleString();
    document.getElementById('p-headcount').innerText = lista.length;

    // Gera HTML
    const tbody = document.getElementById('tabela-corpo');
    
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">Nenhum registo encontrado para este período.</td></tr>';
        return;
    }

    // Criamos o HTML todo de uma vez (mais rápido que criar elementos um a um)
    let html = '';
    lista.forEach(user => {
        const diasCount = user.diasTrabalhados.size || 1;
        // Meta simples: 650 por dia. (Futuramente podes cruzar com metasGlobais se quiseres algo exato)
        const metaCalculada = 650 * diasCount;
        
        const atingiuMeta = user.total >= metaCalculada;
        
        // Classes condicionais (Tailwind)
        const corBadge = atingiuMeta ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-rose-100 text-rose-800 border-rose-200';
        const textoBadge = atingiuMeta ? 'Atingida' : 'Abaixo';

        html += `
        <tr class="hover:bg-slate-50 transition duration-150 border-b border-slate-100">
            <td class="px-6 py-4 font-medium text-slate-900">${user.nome}</td>
            <td class="px-6 py-4 text-center font-bold text-blue-700 text-lg">${user.total.toLocaleString()}</td>
            <td class="px-6 py-4 text-center text-slate-600">${user.fifo}</td>
            <td class="px-6 py-4 text-center text-slate-600">${user.gt}</td>
            <td class="px-6 py-4 text-center text-slate-600">${user.gp}</td>
            <td class="px-6 py-4 text-center text-slate-400">${metaCalculada.toLocaleString()}</td>
            <td class="px-6 py-4 text-center">
                <span class="${corBadge} text-xs font-bold px-3 py-1 rounded-full border">
                    ${textoBadge}
                </span>
            </td>
        </tr>
        `;
    });

    tbody.innerHTML = html;
}

// Função de Importação de Excel (Mantida similar, apenas limpa)
async function importarArquivos() {
    const files = document.getElementById('excel-files').files;
    if (files.length === 0) return;

    const btn = document.getElementById('btn-import');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '⏳ Processando...';
    btn.disabled = true;

    let log = { ok: 0, dup: 0, err: 0 };

    for (let f of files) {
        try {
            // Valida nome do ficheiro (Espera formato AAAAMMDD.xlsx)
            const name = f.name.replace('.xlsx', '');
            if (!/^\d{8}$/.test(name)) { 
                console.warn(`Arquivo ignorado (nome inválido): ${f.name}`);
                log.err++; 
                continue; 
            }

            const dataRef = `${name.substring(0, 4)}-${name.substring(4, 6)}-${name.substring(6, 8)}`;
            
            const buffer = await f.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array' });
            const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

            for (let row of json) {
                if (!row.id_assistente) continue;

                // Verifica duplicidade antes de inserir
                const { data: exists } = await _supabase
                    .from('producao')
                    .select('id')
                    .eq('usuario_id', row.id_assistente)
                    .eq('data_referencia', dataRef)
                    .maybeSingle();

                if (exists) {
                    log.dup++;
                } else {
                    await _supabase.from('producao').insert({
                        usuario_id: row.id_assistente,
                        data_referencia: dataRef,
                        fifo: row.documentos_validados_fifo || 0,
                        gradual_total: row.documentos_validados_gradual_total || 0,
                        gradual_parcial: row.documentos_validados_gradual_parcial || 0,
                        perfil_fc: row.documentos_validados_perfil_fc || 0,
                        quantidade: row.documentos_validados || 0
                    });
                    log.ok++;
                }
            }
        } catch (e) {
            console.error(e);
            log.err++;
        }
    }

    alert(`Fim da Importação!\n✅ Sucesso: ${log.ok}\n⚠️ Duplicados: ${log.dup}\n❌ Erros: ${log.err}`);
    
    // Reseta estado
    btn.innerHTML = originalText;
    btn.disabled = false;
    document.getElementById('excel-files').value = "";
    
    // Recarrega a tabela para mostrar os novos dados
    carregarDados();
}