// js/produtividade.js

// Variáveis globais para armazenar os dados carregados
let dadosGlobais = [];
let metasGlobais = [];

document.addEventListener('DOMContentLoaded', () => {
    // Configura datas iniciais (Ontem, pois hoje pode não ter dados ainda)
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    
    document.getElementById('select-dia').value = ontem.toISOString().split('T')[0];
    document.getElementById('select-mes').value = ontem.toISOString().substring(0, 7);
    
    // Inicia carregamento
    ajustarSeletores(); 
});

// Controla qual input de data aparece (Dia ou Mês)
function ajustarSeletores() {
    const view = document.getElementById('view-selector').value;
    const inputDia = document.getElementById('select-dia');
    const inputMes = document.getElementById('select-mes');

    if (view === 'dia') {
        inputDia.classList.remove('hidden');
        inputMes.classList.add('hidden');
    } else {
        inputDia.classList.add('hidden');
        inputMes.classList.remove('hidden');
        // Sincroniza o dia com o mês selecionado
        if(inputDia.value) inputMes.value = inputDia.value.substring(0, 7);
    }

    carregarDados();
}

async function carregarDados() {
    const view = document.getElementById('view-selector').value;
    
    // Define o range de datas para busca
    let dataInicio, dataFim, titulo;
    
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
        // Pega o último dia do mês
        const [ano, m] = mes.split('-');
        const ultimoDia = new Date(ano, m, 0).getDate();
        dataFim = `${mes}-${ultimoDia}`;
        titulo = `Visão Mensal: ${mes}`;
    }

    document.getElementById('panel-titulo').innerText = "Carregando dados...";
    document.getElementById('tabela-corpo').innerHTML = '<tr><td colspan="7" class="text-center py-8">Carregando...</td></tr>';

    try {
        // 1. Busca Produção
        const { data: producao, error: errP } = await _supabase
            .from('producao')
            .select('*, usuarios(*)') // Faz o JOIN com usuarios para pegar o nome
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        if (errP) throw errP;

        // 2. Busca Metas
        const { data: metas, error: errM } = await _supabase
            .from('metas')
            .select('*');

        if (errM) throw errM;

        dadosGlobais = producao || [];
        metasGlobais = metas || [];

        renderizarTabela(titulo);

    } catch (erro) {
        console.error(erro);
        alert("Erro ao carregar dados. Veja o console.");
    }
}

function renderizarTabela(tituloPainel) {
    document.getElementById('panel-titulo').innerText = tituloPainel;
    
    // Agrupa dados por usuário (pois na visão mensal pode ter várias linhas por pessoa)
    let stats = {};

    dadosGlobais.forEach(item => {
        // Ignora quem não é assistente ou se o usuario foi excluido
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
                diasTrabalhados: new Set() // Usamos Set para contar dias únicos
            };
        }

        stats[uid].total += (item.quantidade || 0);
        stats[uid].fifo += (item.fifo || 0);
        stats[uid].gt += (item.gradual_total || 0);
        stats[uid].gp += (item.gradual_parcial || 0);
        stats[uid].diasTrabalhados.add(item.data_referencia);
    });

    // Converte objeto em array e ordena por produção (maior para menor)
    const lista = Object.values(stats).sort((a, b) => b.total - a.total);

    // Atualiza KPIs
    const somaTotal = lista.reduce((acc, curr) => acc + curr.total, 0);
    const media = lista.length ? Math.round(somaTotal / lista.length) : 0;

    document.getElementById('p-total').innerText = somaTotal.toLocaleString();
    document.getElementById('p-media').innerText = media.toLocaleString();
    document.getElementById('p-headcount').innerText = lista.length;

    // Gera HTML da Tabela
    const tbody = document.getElementById('tabela-corpo');
    
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-500">Nenhum dado encontrado para este período.</td></tr>';
        return;
    }

    let html = '';
    lista.forEach(user => {
        // Cálculo simples de Meta (Assumindo 650 por dia trabalhado)
        // Numa versão futura podemos pegar a meta exata do banco
        const diasCount = user.diasTrabalhados.size || 1;
        const metaCalculada = 650 * diasCount;
        
        const atingiuMeta = user.total >= metaCalculada;
        const corBadge = atingiuMeta ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800';
        const textoBadge = atingiuMeta ? 'Atingida' : 'Abaixo';

        html += `
        <tr class="hover:bg-slate-50 transition duration-150">
            <td class="px-6 py-4 font-medium text-slate-900">${user.nome}</td>
            <td class="px-6 py-4 text-center font-bold text-blue-700">${user.total.toLocaleString()}</td>
            <td class="px-6 py-4 text-center">${user.fifo}</td>
            <td class="px-6 py-4 text-center">${user.gt}</td>
            <td class="px-6 py-4 text-center">${user.gp}</td>
            <td class="px-6 py-4 text-center text-slate-400">${metaCalculada.toLocaleString()}</td>
            <td class="px-6 py-4 text-center">
                <span class="${corBadge} text-xs font-bold px-2.5 py-0.5 rounded-full border border-opacity-20">
                    ${textoBadge}
                </span>
            </td>
        </tr>
        `;
    });

    tbody.innerHTML = html;
}