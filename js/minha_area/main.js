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
        if (isUserAdmin) {
            MinhaArea.usuarioAlvo = lastAlvo && lastAlvo !== 'null' ? lastAlvo : 'todos';
        } else {
            MinhaArea.usuarioAlvo = MinhaArea.user.id;
        }
    }

    if (window.Sistema && !window.Sistema.supabase) await window.Sistema.inicializar(false);

    // Filtro Unificado
    const lastType = localStorage.getItem('ma_filter_type') || 'mes';
    const lastValue = localStorage.getItem('ma_filter_value');
    
    const selectType = document.getElementById('filtro-tipo');
    if (selectType) {
        selectType.value = lastType;
        MinhaArea.renderizarInputsFiltro(lastType, lastValue);
    } else if (!MinhaArea.dataAtual) {
        MinhaArea.dataAtual = new Date();
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

// --- RENDERIZAÇÃO DOS INPUTS DE FILTRO (CUSTOMIZADOS) ---
MinhaArea.mudarTipoFiltro = function(tipo, valorSalvo = null) {
    // Reseta para padrão se mudar o tipo manualmente
    if (!valorSalvo) {
        const hoje = new Date();
        const y = hoje.getFullYear();
        const m = String(hoje.getMonth() + 1).padStart(2,'0');
        const d = hoje.toISOString().split('T')[0];
        
        if (tipo === 'dia') valorSalvo = d;
        else if (tipo === 'semana') valorSalvo = `W1-${y}-${m}`;
        else if (tipo === 'mes') valorSalvo = `${y}-${m}`;
        else if (tipo === 'trimestre') valorSalvo = `Q1-${y}`;
        else if (tipo === 'semestre') valorSalvo = `S1-${y}`;
        else if (tipo === 'ano') valorSalvo = `${y}`;
        else valorSalvo = 'todos';
    }
    
    MinhaArea.renderizarInputsFiltro(tipo, valorSalvo);
    MinhaArea.capturarValorFiltro();
};

MinhaArea.renderizarInputsFiltro = function(tipo, valorSalvo) {
    const container = document.getElementById('filtro-valor-container');
    if (!container) return;

    localStorage.setItem('ma_filter_type', tipo);
    let html = '';
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');

    // Helper para gerar options de meses
    const getMesesOptions = (selectedMes) => {
        const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        return meses.map((m, i) => {
            const val = String(i + 1).padStart(2, '0');
            return `<option value="${val}" ${val === selectedMes ? 'selected' : ''}>${m}</option>`;
        }).join('');
    };

    if (tipo === 'dia') {
        const val = (valorSalvo && valorSalvo.length === 10) ? valorSalvo : hoje.toISOString().split('T')[0];
        html = `<input type="date" id="f-dia" value="${val}" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs w-[110px]">`;
    } 
    else if (tipo === 'semana') {
        // Formato: W1-2025-10
        let w = '1', y = anoAtual, m = mesAtual;
        if (valorSalvo && valorSalvo.startsWith('W')) {
            const parts = valorSalvo.split('-');
            if(parts.length === 3) { w = parts[0].replace('W',''); y = parts[1]; m = parts[2]; }
        }
        html = `
            <div class="flex items-center gap-1">
                <select id="f-sem-num" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs cursor-pointer">
                    <option value="1" ${w=='1'?'selected':''}>Semana 1</option>
                    <option value="2" ${w=='2'?'selected':''}>Semana 2</option>
                    <option value="3" ${w=='3'?'selected':''}>Semana 3</option>
                    <option value="4" ${w=='4'?'selected':''}>Semana 4</option>
                    <option value="5" ${w=='5'?'selected':''}>Semana 5</option>
                </select>
                <select id="f-sem-mes" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs cursor-pointer w-[80px]">
                    ${getMesesOptions(m)}
                </select>
                <input type="number" id="f-sem-ano" value="${y}" min="2020" max="2030" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs w-[50px] text-center">
            </div>`;
    }
    else if (tipo === 'mes') {
        // Formato: 2025-10
        let y = anoAtual, m = mesAtual;
        if (valorSalvo && valorSalvo.length === 7) {
            [y, m] = valorSalvo.split('-');
        }
        html = `
            <div class="flex items-center gap-1">
                <select id="f-mes-mm" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs cursor-pointer w-[90px]">
                    ${getMesesOptions(m)}
                </select>
                <input type="number" id="f-mes-yyyy" value="${y}" min="2020" max="2030" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs w-[50px] text-center">
            </div>`;
    } 
    else if (tipo === 'trimestre') {
        let q = '1', y = anoAtual;
        if (valorSalvo && valorSalvo.startsWith('Q')) {
            const parts = valorSalvo.split('-');
            if(parts.length === 2) { q = parts[0].replace('Q',''); y = parts[1]; }
        }
        html = `
            <div class="flex items-center gap-1">
                <select id="f-tri-num" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs cursor-pointer">
                    <option value="1" ${q=='1'?'selected':''}>1º Tri</option>
                    <option value="2" ${q=='2'?'selected':''}>2º Tri</option>
                    <option value="3" ${q=='3'?'selected':''}>3º Tri</option>
                    <option value="4" ${q=='4'?'selected':''}>4º Tri</option>
                </select>
                <input type="number" id="f-tri-ano" value="${y}" min="2020" max="2030" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs w-[50px] text-center">
            </div>`;
    }
    else if (tipo === 'semestre') {
        let s = '1', y = anoAtual;
        if (valorSalvo && valorSalvo.startsWith('S')) {
            const parts = valorSalvo.split('-');
            if(parts.length === 2) { s = parts[0].replace('S',''); y = parts[1]; }
        }
        html = `
            <div class="flex items-center gap-1">
                <select id="f-sem-num" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs cursor-pointer">
                    <option value="1" ${s=='1'?'selected':''}>1º Sem</option>
                    <option value="2" ${s=='2'?'selected':''}>2º Sem</option>
                </select>
                <input type="number" id="f-sem-ano" value="${y}" min="2020" max="2030" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs w-[50px] text-center">
            </div>`;
    }
    else if (tipo === 'ano') {
        const val = (valorSalvo && valorSalvo.length === 4) ? valorSalvo : anoAtual;
        html = `<input type="number" id="f-ano" value="${val}" min="2020" max="2030" onchange="MinhaArea.capturarValorFiltro()" class="bg-transparent font-bold text-slate-700 outline-none text-xs w-[60px] text-center">`;
    }
    else if (tipo === 'todos') {
        html = `<span class="text-xs font-bold text-slate-400 px-2">Histórico Completo</span>`;
    }

    container.innerHTML = html;
};

// Lê os inputs customizados, monta a string padrão e salva
MinhaArea.capturarValorFiltro = function() {
    const tipo = document.getElementById('filtro-tipo')?.value;
    let val = '';

    if (tipo === 'dia') {
        val = document.getElementById('f-dia').value;
    } 
    else if (tipo === 'semana') {
        const w = document.getElementById('f-sem-num').value;
        const m = document.getElementById('f-sem-mes').value; 
        const y = document.getElementById('f-sem-ano').value;
        val = `W${w}-${y}-${m}`; 
    }
    else if (tipo === 'mes') {
        const m = document.getElementById('f-mes-mm').value;
        const y = document.getElementById('f-mes-yyyy').value;
        val = `${y}-${m}`;
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
    
    // Atualiza Data Global para manter compatibilidade
    const datas = MinhaArea.getPeriodo(); 
    if (datas && datas.inicio) {
        const [y, m, d] = datas.inicio.split('-').map(Number);
        MinhaArea.dataAtual = new Date(y, m-1, d, 12, 0, 0);
    }

    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) MinhaArea.mudarAba(activeBtn.id.replace('btn-ma-', ''));
};

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
            try {
                // val = "W1-2025-10"
                const parts = val.split('-'); 
                const weekNum = parseInt(parts[0].replace('W',''));
                const y = parseInt(parts[1]);
                const m = parseInt(parts[2]);
                const lastDayOfMonth = new Date(y, m, 0).getDate();

                const dStart = (weekNum - 1) * 7 + 1;
                let dEnd = weekNum * 7;
                
                if (dEnd > lastDayOfMonth) dEnd = lastDayOfMonth;
                if (dStart > lastDayOfMonth) {
                    inicio = `${y}-${String(m).padStart(2,'0')}-${lastDayOfMonth}`;
                    fim = inicio;
                } else {
                    inicio = `${y}-${String(m).padStart(2,'0')}-${String(dStart).padStart(2,'0')}`;
                    fim = `${y}-${String(m).padStart(2,'0')}-${String(dEnd).padStart(2,'0')}`;
                }
                const nomeMes = new Date(y, m-1).toLocaleString('pt-BR', {month:'long'});
                texto = `Semana ${weekNum} de ${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}/${y}`;
            } catch(e) { inicio = hoje.toISOString().split('T')[0]; fim = inicio; }
        }
        else if (tipo === 'mes') {
            const [y, m] = val.split('-').map(Number);
            inicio = `${y}-${String(m).padStart(2,'0')}-01`;
            fim = `${y}-${String(m).padStart(2,'0')}-${new Date(y, m, 0).getDate()}`;
            const nomeMes = new Date(y, m-1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
            texto = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);
        } 
        else if (tipo === 'trimestre') {
            const parts = val.split('-');
            const q = parseInt(parts[0].replace('Q',''));
            const y = parseInt(parts[1]);
            const startMonth = (q - 1) * 3;
            const endMonth = startMonth + 2; 
            inicio = new Date(y, startMonth, 1).toISOString().split('T')[0];
            fim = new Date(y, endMonth + 1, 0).toISOString().split('T')[0];
            texto = `${q}º Trimestre de ${y}`;
        }
        else if (tipo === 'semestre') {
            const parts = val.split('-');
            const s = parseInt(parts[0].replace('S',''));
            const y = parseInt(parts[1]);
            const startMonth = (s - 1) * 6;
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
    
    return { inicio, fim, texto, tipo };
};

// ... Funções de usuário e abas mantidas iguais ...
MinhaArea.carregarListaUsuarios = async function(selectElement) {
    try {
        const { data, error } = await MinhaArea.supabase
            .from('usuarios')
            .select('id, nome')
            .eq('funcao', 'Assistente')
            .eq('ativo', true)
            .order('nome');

        if(error) throw error;

        selectElement.innerHTML = '<option value="todos">Toda a Equipe</option>';
        data.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id; opt.innerText = u.nome; selectElement.appendChild(opt);
        });
        
        if (MinhaArea.usuarioAlvo && MinhaArea.usuarioAlvo !== 'todos') {
             const exists = Array.from(selectElement.options).some(o => o.value == MinhaArea.usuarioAlvo);
             selectElement.value = exists ? MinhaArea.usuarioAlvo : 'todos';
        } else {
            selectElement.value = 'todos';
        }
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