window.MinhaArea = window.MinhaArea || {
    user: null,
    dataAtual: new Date(),
    usuarioAlvo: 'todos',
    
    get supabase() { return window.Sistema ? window.Sistema.supabase : (window._supabase || null); }
};

MinhaArea.init = async function() {
    const storedUser = localStorage.getItem('usuario_logado');
    if (!storedUser && !window.location.pathname.includes('index.html')) return;
    
    if (storedUser) {
        MinhaArea.user = JSON.parse(storedUser);
        const isUserAdmin = MinhaArea.user.funcao === 'GESTORA' || MinhaArea.user.perfil === 'admin' || MinhaArea.user.id == 1000;
        const lastAlvo = localStorage.getItem('ma_lastUserAlvo');
        MinhaArea.usuarioAlvo = isUserAdmin ? (lastAlvo && lastAlvo!=='null' ? lastAlvo : 'todos') : MinhaArea.user.id;
    }

    if (window.Sistema && !window.Sistema.supabase) await window.Sistema.inicializar(false);

    // --- INICIALIZA FILTRO UNIFICADO ---
    const lastType = localStorage.getItem('ma_filter_type') || 'mes';
    const lastValue = localStorage.getItem('ma_filter_value'); // Ex: "M10-2025", "W2-2025-10", "Q1-2025"
    
    const selectType = document.getElementById('filtro-tipo');
    if (selectType) {
        selectType.value = lastType;
        MinhaArea.renderizarInputsFiltro(lastType, lastValue);
    }

    // Admin Controls
    const isAdmin = ['GESTORA', 'AUDITORA'].includes((MinhaArea.user.funcao||'').toUpperCase()) || MinhaArea.user.perfil === 'admin' || MinhaArea.user.id == 1000;
    if (isAdmin) {
        const controls = document.getElementById('admin-controls');
        const select = document.getElementById('admin-user-select');
        if(controls && select) {
            controls.classList.remove('hidden');
            await MinhaArea.carregarListaUsuarios(select);
        }
    }

    const lastTab = localStorage.getItem('ma_lastActiveTab');
    MinhaArea.mudarAba(lastTab || 'diario');
};

// --- RENDERIZAÇÃO DOS INPUTS DE FILTRO ---
MinhaArea.mudarTipoFiltro = function(tipo) {
    // Ao mudar o tipo, reseta para o valor padrão (hoje)
    MinhaArea.renderizarInputsFiltro(tipo, null);
    MinhaArea.capturarValorFiltro(); // Salva e recarrega
};

MinhaArea.renderizarInputsFiltro = function(tipo, valorSalvo) {
    const container = document.getElementById('filtro-valor-container');
    if (!container) return;

    localStorage.setItem('ma_filter_type', tipo);
    let html = '';
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');
    const hojeIso = hoje.toISOString().split('T')[0];

    // Parser do valor salvo (se existir)
    // Formatos esperados:
    // dia: "2025-10-01"
    // semana: "W2-2025-10" (Semana 2 de Out/2025)
    // mes: "2025-10"
    // trimestre: "Q1-2025"
    // semestre: "S1-2025"
    // ano: "2025"

    if (tipo === 'dia') {
        const val = valorSalvo && valorSalvo.length === 10 ? valorSalvo : hojeIso;
        html = `<input type="date" id="f-dia" value="${val}" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs w-[110px]">`;
    } 
    else if (tipo === 'semana') {
        // Default: Semana 1 do Mês Atual
        let w = '1';
        let m = `${anoAtual}-${mesAtual}`;
        if (valorSalvo && valorSalvo.startsWith('W')) {
            const parts = valorSalvo.split('-'); // W2, 2025, 10
            if(parts.length === 3) { w = parts[0].replace('W',''); m = `${parts[1]}-${parts[2]}`; }
        }
        html = `
            <div class="flex items-center gap-1">
                <select id="f-sem-num" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs">
                    <option value="1" ${w=='1'?'selected':''}>Semana 1</option>
                    <option value="2" ${w=='2'?'selected':''}>Semana 2</option>
                    <option value="3" ${w=='3'?'selected':''}>Semana 3</option>
                    <option value="4" ${w=='4'?'selected':''}>Semana 4</option>
                    <option value="5" ${w=='5'?'selected':''}>Semana 5</option>
                </select>
                <span class="text-slate-300">|</span>
                <input type="month" id="f-sem-mes" value="${m}" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs w-[100px]">
            </div>`;
    }
    else if (tipo === 'mes') {
        const val = valorSalvo && valorSalvo.length === 7 ? valorSalvo : `${anoAtual}-${mesAtual}`;
        html = `<input type="month" id="f-mes" value="${val}" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs w-[110px]">`;
    }
    else if (tipo === 'trimestre') {
        let q = '1';
        let y = anoAtual;
        if (valorSalvo && valorSalvo.startsWith('Q')) {
            const parts = valorSalvo.split('-');
            if(parts.length === 2) { q = parts[0].replace('Q',''); y = parts[1]; }
        }
        html = `
            <div class="flex items-center gap-1">
                <select id="f-tri-num" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs">
                    <option value="1" ${q=='1'?'selected':''}>1º Tri</option>
                    <option value="2" ${q=='2'?'selected':''}>2º Tri</option>
                    <option value="3" ${q=='3'?'selected':''}>3º Tri</option>
                    <option value="4" ${q=='4'?'selected':''}>4º Tri</option>
                </select>
                <input type="number" id="f-tri-ano" value="${y}" min="2020" max="2030" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs w-[50px]">
            </div>`;
    }
    else if (tipo === 'semestre') {
        let s = '1';
        let y = anoAtual;
        if (valorSalvo && valorSalvo.startsWith('S')) {
            const parts = valorSalvo.split('-');
            if(parts.length === 2) { s = parts[0].replace('S',''); y = parts[1]; }
        }
        html = `
            <div class="flex items-center gap-1">
                <select id="f-sem-num" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs">
                    <option value="1" ${s=='1'?'selected':''}>1º Sem</option>
                    <option value="2" ${s=='2'?'selected':''}>2º Sem</option>
                </select>
                <input type="number" id="f-sem-ano" value="${y}" min="2020" max="2030" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs w-[50px]">
            </div>`;
    }
    else if (tipo === 'ano') {
        const val = valorSalvo && valorSalvo.length === 4 ? valorSalvo : anoAtual;
        html = `<input type="number" id="f-ano" value="${val}" min="2020" max="2030" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs w-[60px]">`;
    }
    else if (tipo === 'todos') {
        html = `<span class="text-xs font-bold text-slate-400 px-2">Todo o Histórico</span>`;
    }

    container.innerHTML = html;
};

// Lê os inputs, monta a string única e salva
MinhaArea.capturarValorFiltro = function() {
    const tipo = document.getElementById('filtro-tipo')?.value;
    let val = '';

    if (tipo === 'dia') {
        val = document.getElementById('f-dia').value;
    } 
    else if (tipo === 'semana') {
        const w = document.getElementById('f-sem-num').value;
        const m = document.getElementById('f-sem-mes').value; // YYYY-MM
        val = `W${w}-${m}`; // W1-2025-10
    }
    else if (tipo === 'mes') {
        val = document.getElementById('f-mes').value; // YYYY-MM
    }
    else if (tipo === 'trimestre') {
        const q = document.getElementById('f-tri-num').value;
        const y = document.getElementById('f-tri-ano').value;
        val = `Q${q}-${y}`;
    }
    else if (tipo === 'semestre') {
        const s = document.getElementById('f-sem-num').value;
        const y = document.getElementById('f-sem-ano').value;
        val = `S${s}-${y}`;
    }
    else if (tipo === 'ano') {
        val = document.getElementById('f-ano').value;
    }
    else if (tipo === 'todos') {
        val = 'todos';
    }

    localStorage.setItem('ma_filter_value', val);
    
    // Atualiza dataAtual para compatibilidade (pega o início do período)
    const datas = MinhaArea.getPeriodo(); // Isso vai ler o DOM ou localStorage
    if (datas && datas.inicio) {
        const [y, m, d] = datas.inicio.split('-').map(Number);
        MinhaArea.dataAtual = new Date(y, m-1, d, 12, 0, 0);
    }

    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) MinhaArea.mudarAba(activeBtn.id.replace('btn-ma-', ''));
};

// CÁLCULO DE DATAS
MinhaArea.getPeriodo = function() {
    const tipo = localStorage.getItem('ma_filter_type') || 'mes';
    const val = localStorage.getItem('ma_filter_value');
    
    let inicio = '', fim = '', texto = '';
    const hoje = new Date();

    if (!val) { 
        inicio = hoje.toISOString().split('T')[0]; fim = inicio; 
    } else {
        if (tipo === 'dia') {
            inicio = val; fim = val;
            texto = new Date(val + 'T12:00:00').toLocaleDateString('pt-BR');
        } 
        else if (tipo === 'semana') {
            // Val: W1-2025-10
            try {
                const parts = val.split('-'); // ["W1", "2025", "10"]
                const weekNum = parseInt(parts[0].replace('W',''));
                const y = parseInt(parts[1]);
                const m = parseInt(parts[2]);
                const lastDayOfMonth = new Date(y, m, 0).getDate();

                // Lógica de "Semana do Mês" simples (1-7, 8-14...)
                const dStart = (weekNum - 1) * 7 + 1;
                let dEnd = weekNum * 7;
                
                if (dEnd > lastDayOfMonth) dEnd = lastDayOfMonth;
                if (dStart > lastDayOfMonth) {
                    // Semana inexistente (ex: Semana 5 num mês de 28 dias)
                    inicio = `${y}-${String(m).padStart(2,'0')}-${lastDayOfMonth}`;
                    fim = inicio;
                } else {
                    inicio = `${y}-${String(m).padStart(2,'0')}-${String(dStart).padStart(2,'0')}`;
                    fim = `${y}-${String(m).padStart(2,'0')}-${String(dEnd).padStart(2,'0')}`;
                }
                texto = `Semana ${weekNum} de ${new Date(y, m-1).toLocaleString('pt-BR', {month:'long'})}/${y}`;
            } catch(e) { inicio = hoje.toISOString().split('T')[0]; fim = inicio; }
        }
        else if (tipo === 'mes') {
            const [y, m] = val.split('-').map(Number);
            inicio = `${y}-${String(m).padStart(2,'0')}-01`;
            fim = `${y}-${String(m).padStart(2,'0')}-${new Date(y, m, 0).getDate()}`;
            texto = new Date(y, m-1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        } 
        else if (tipo === 'trimestre') {
            // Q1-2025
            const parts = val.split('-');
            const q = parseInt(parts[0].replace('Q',''));
            const y = parseInt(parts[1]);
            const startMonth = (q - 1) * 3; // 0, 3, 6, 9
            const endMonth = startMonth + 2; 
            
            inicio = new Date(y, startMonth, 1).toISOString().split('T')[0];
            fim = new Date(y, endMonth + 1, 0).toISOString().split('T')[0];
            texto = `${q}º Trimestre de ${y}`;
        }
        else if (tipo === 'semestre') {
            // S1-2025
            const parts = val.split('-');
            const s = parseInt(parts[0].replace('S',''));
            const y = parseInt(parts[1]);
            const startMonth = (s - 1) * 6; // 0 ou 6
            const endMonth = startMonth + 5;
            
            inicio = new Date(y, startMonth, 1).toISOString().split('T')[0];
            fim = new Date(y, endMonth + 1, 0).toISOString().split('T')[0];
            texto = `${s}º Semestre de ${y}`;
        }
        else if (tipo === 'ano') {
            inicio = `${val}-01-01`; fim = `${val}-12-31`; texto = `Ano ${val}`;
        }
        else if (tipo === 'todos') {
            inicio = '2020-01-01'; fim = new Date().toISOString().split('T')[0]; texto = 'Todo o Histórico';
        }
    }
    
    if(texto) texto = texto.charAt(0).toUpperCase() + texto.slice(1);
    return { inicio, fim, texto, tipo };
};

// ... Resto das funções (carregarListaUsuarios, mudarUsuarioAlvo, mudarAba) mantidas iguais ...
MinhaArea.carregarListaUsuarios = async function(selectElement) {
    try {
        const { data, error } = await MinhaArea.supabase.from('usuarios').select('id, nome').eq('funcao', 'Assistente').eq('ativo', true).order('nome');
        if(error) throw error;
        selectElement.innerHTML = '<option value="todos">Toda a Equipe</option>';
        data.forEach(u => {
            const opt = document.createElement('option'); opt.value = u.id; opt.innerText = u.nome; selectElement.appendChild(opt);
        });
        if (MinhaArea.usuarioAlvo && MinhaArea.usuarioAlvo !== 'todos') {
             const exists = Array.from(selectElement.options).some(o => o.value == MinhaArea.usuarioAlvo);
             selectElement.value = exists ? MinhaArea.usuarioAlvo : 'todos';
        } else { selectElement.value = 'todos'; }
    } catch (err) { console.error(err); }
};

MinhaArea.mudarUsuarioAlvo = function(val) {
    MinhaArea.usuarioAlvo = val;
    localStorage.setItem('ma_lastUserAlvo', val);
    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) MinhaArea.mudarAba(activeBtn.id.replace('btn-ma-', ''));
};

MinhaArea.mudarAba = function(aba) {
    localStorage.setItem('ma_lastActiveTab', aba);
    document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const view = document.getElementById(`ma-tab-${aba}`);
    const btn = document.getElementById(`btn-ma-${aba}`);
    if(view) view.classList.remove('hidden');
    if(btn) btn.classList.add('active');

    if (aba === 'diario' && MinhaArea.Diario) MinhaArea.Diario.carregar();
    else if (aba === 'evolucao' && MinhaArea.Evolucao) MinhaArea.Evolucao.carregar();
    else if (aba === 'comparativo' && MinhaArea.Comparativo) MinhaArea.Comparativo.carregar();
    else if (aba === 'assertividade' && MinhaArea.Assertividade) MinhaArea.Assertividade.carregar();
    else if (aba === 'feedback' && MinhaArea.Feedback) MinhaArea.Feedback.carregar();
};

document.addEventListener('DOMContentLoaded', MinhaArea.init);