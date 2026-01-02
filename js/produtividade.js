// js/produtividade.js

// Variáveis globais
let dadosBrutos = [];
let mapaUsuarios = {}; // ID -> Nome
let dadosAgrupados = []; // Dados normalizados por nome

document.addEventListener('DOMContentLoaded', async () => {
    // Configura datas iniciais para 'Ontem'
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    
    const strHoje = ontem.toISOString().split('T')[0];
    const strMes = ontem.toISOString().substring(0, 7);

    // Proteção contra elementos inexistentes
    if(document.getElementById('select-dia')) document.getElementById('select-dia').value = strHoje;
    if(document.getElementById('select-mes')) document.getElementById('select-mes').value = strMes;
    
    ajustarSeletores();
    await carregarMapaUsuarios(); // Passo crucial: Saber quem é quem antes de tudo
    carregarDados(); 
});

// 1. Carrega Mapa de Usuários (ID -> Nome) para normalização
async function carregarMapaUsuarios() {
    if (!_supabase) return;
    const { data } = await _supabase.from('usuarios').select('id, nome, funcao');
    if (data) {
        data.forEach(u => {
            mapaUsuarios[u.id] = { nome: u.nome, funcao: u.funcao };
        });
    }
}

function ajustarSeletores() {
    const view = document.getElementById('view-selector').value;
    const inputDia = document.getElementById('select-dia');
    const inputMes = document.getElementById('select-mes');
    const inputSemana = document.getElementById('select-semana');

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

function getWeekNumber(dateString) { 
    const date = new Date(dateString + 'T12:00:00'); 
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay(); 
    return Math.ceil((date.getDate() + firstDay) / 7); 
}

// 2. Carregamento e NORMALIZAÇÃO
async function carregarDados() {
    const view = document.getElementById('view-selector').value;
    let dataInicio, dataFim, titulo, semanaSel;
    
    if (view === 'dia') {
        const dia = document.getElementById('select-dia').value;
        if (!dia) return;
        dataInicio = dia; dataFim = dia;
        titulo = `Visão do Dia: ${dia.split('-').reverse().join('/')}`;
    } else {
        const mes = document.getElementById('select-mes').value;
        if (!mes) return;
        dataInicio = `${mes}-01`;
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

    document.getElementById('panel-titulo').innerText = "A carregar e consolidar dados...";
    const tbody = document.getElementById('tabela-corpo');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 animate-pulse text-blue-600">A processar dados...</td></tr>';

    try {
        const { data, error } = await _supabase
            .from('producao')
            .select('*')
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        if (error) throw error;

        let dadosFiltrados = data || [];
        if (view === 'semana') {
            dadosFiltrados = dadosFiltrados.filter(d => getWeekNumber(d.data_referencia) === semanaSel);
        }

        // --- AQUI ACONTECE A MÁGICA DA NORMALIZAÇÃO ---
        processarDadosUnicos(dadosFiltrados);
        renderizarTabela(titulo);

    } catch (erro) {
        console.error(erro);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500 font-bold">Erro na consolidação.</td></tr>';
    }
}

// 3. Processamento com Regra de Nome Único
function processarDadosUnicos(dados) {
    const mapaConsolidado = {}; // Chave será o NOME

    dados.forEach(item => {
        // Pega info do usuário pelo ID
        const usuarioInfo = mapaUsuarios[item.usuario_id];
        
        // REGRA: Se não for Assistente (ex: Auditora/Gestora), IGNORA os dados da planilha
        if (!usuarioInfo || usuarioInfo.funcao !== 'Assistente') return;

        const nome = usuarioInfo.nome;

        if (!mapaConsolidado[nome]) {
            mapaConsolidado[nome] = {
                nome: nome,
                total: 0,
                fifo: 0,
                gt: 0,
                gp: 0,
                diasTrabalhados: new Set() // Set para contar dias únicos trabalhados
            };
        }

        // Soma TUDO (independente de qual ID veio, se o nome é igual, soma)
        mapaConsolidado[nome].total += (item.quantidade || 0);
        mapaConsolidado[nome].fifo += (item.fifo || 0);
        mapaConsolidado[nome].gt += (item.gradual_total || 0);
        mapaConsolidado[nome].gp += (item.gradual_parcial || 0);
        
        // Só conta dia trabalhado se produziu algo
        if (item.quantidade > 0) {
            mapaConsolidado[nome].diasTrabalhados.add(item.data_referencia);
        }
    });

    // Converte para array
    dadosAgrupados = Object.values(mapaConsolidado).sort((a, b) => b.total - a.total);
}

function renderizarTabela(tituloPainel) {
    document.getElementById('panel-titulo').innerText = tituloPainel;
    
    // Cálculos de KPIs consolidados
    const somaTotal = dadosAgrupados.reduce((acc, curr) => acc + curr.total, 0);
    // Headcount = Número de nomes únicos que tiveram produção > 0
    const assistentesAtivas = dadosAgrupados.filter(u => u.total > 0).length;
    
    // Média = Total / (Soma dos dias trabalhados de cada uma) ?? 
    // NÃO. Média do Time = Total Produção / Total Dias-Pessoa Trabalhados.
    // Ex: Maria trabalhou 2 dias (fez 2000), Joana 1 dia (fez 500). Total=2500. Dias=3. Média=833.
    // Isso é o mais justo para o consolidado.
    
    let totalDiasPessoa = 0;
    dadosAgrupados.forEach(u => totalDiasPessoa += u.diasTrabalhados.size);
    
    const mediaGeral = totalDiasPessoa ? Math.round(somaTotal / totalDiasPessoa) : 0;

    document.getElementById('p-total').innerText = somaTotal.toLocaleString();
    document.getElementById('p-media').innerText = mediaGeral.toLocaleString();
    document.getElementById('p-headcount').innerText = assistentesAtivas; // Headcount real (nomes únicos)

    const tbody = document.getElementById('tabela-corpo');
    
    if (dadosAgrupados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">Nenhum dado válido encontrado para Assistentes.</td></tr>';
        return;
    }

    let html = '';
    dadosAgrupados.forEach(user => {
        const diasCount = user.diasTrabalhados.size || 1; // Evita divisão por zero
        // Meta baseada nos dias que ELA trabalhou
        const metaCalculada = 650 * diasCount;
        
        const atingiuMeta = user.total >= metaCalculada;
        const mediaPessoal = Math.round(user.total / diasCount);
        
        const corBadge = atingiuMeta ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-rose-100 text-rose-800 border-rose-200';
        const textoBadge = atingiuMeta ? 'Atingida' : 'Abaixo';

        html += `
        <tr class="hover:bg-slate-50 transition duration-150 border-b border-slate-100">
            <td class="px-6 py-4 font-medium text-slate-900">
                ${user.nome}
                <div class="text-[10px] text-slate-400 font-normal">${diasCount} dias trab.</div>
            </td>
            <td class="px-6 py-4 text-center font-bold text-blue-700 text-lg">${user.total.toLocaleString()}</td>
            <td class="px-6 py-4 text-center text-slate-600">${user.fifo}</td>
            <td class="px-6 py-4 text-center text-slate-600">${user.gt}</td>
            <td class="px-6 py-4 text-center text-slate-600">${user.gp}</td>
            <td class="px-6 py-4 text-center text-slate-400">
                ${metaCalculada.toLocaleString()}
                <div class="text-[9px]">Média: ${mediaPessoal}</div>
            </td>
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

// Função de Importação (Mantida, mas limpa para garantir inserção correta)
async function importarArquivos() {
    const files = document.getElementById('excel-files').files;
    if (files.length === 0) return;

    const btn = document.getElementById('btn-import');
    btn.innerHTML = '⏳ Processando...'; btn.disabled = true;

    let log = { ok: 0, dup: 0, err: 0 };

    for (let f of files) {
        try {
            const name = f.name.replace('.xlsx', '');
            if (!/^\d{8}$/.test(name)) { log.err++; continue; } // Valida AAAAMMDD

            const dataRef = `${name.substring(0, 4)}-${name.substring(4, 6)}-${name.substring(6, 8)}`;
            const buffer = await f.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array' });
            const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

            for (let row of json) {
                if (!row.id_assistente) continue;

                // Verifica se já existe esse ID nesse dia (evita duplicar importação)
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
        } catch (e) { console.error(e); log.err++; }
    }

    alert(`Fim da Importação!\n✅ Inseridos: ${log.ok}\n⚠️ Já existiam: ${log.dup}\n❌ Erros: ${log.err}`);
    btn.innerHTML = 'Importar'; btn.disabled = false;
    document.getElementById('excel-files').value = "";
    carregarDados(); // Recarrega com a nova lógica
}