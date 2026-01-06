Gestao.Equipe = {
    filtroAtual: 'ativos',

    carregar: async function() {
        try {
            const { data, error } = await Gestao.supabase.from('usuarios').select('*').order('nome');
            if (error) throw error;
            Gestao.dados.usuarios = data || [];
            this.atualizarContadores();
            this.filtrar(); // Aplica o filtro visual
            this.popularSelectMetas();
        } catch (err) {
            console.error("Erro equipe:", err);
        }
    },

    atualizarContadores: function() {
        const total = Gestao.dados.usuarios.length;
        // Ativo = flag true E contrato não finalizado
        const ativos = Gestao.dados.usuarios.filter(u => u.ativo !== false && u.contrato !== 'FINALIZADO').length;
        document.getElementById('count-ativos').innerText = ativos;
        document.getElementById('count-inativos').innerText = total - ativos;
    },

    mudarFiltro: function(novo) {
        this.filtroAtual = novo;
        // UI Updates
        document.getElementById('btn-sub-ativos').className = `sub-tab-btn flex-1 py-3 text-sm font-bold text-center ${novo==='ativos'?'active':''}`;
        document.getElementById('btn-sub-inativos').className = `sub-tab-btn flex-1 py-3 text-sm font-bold text-center ${novo==='inativos'?'active':''}`;
        this.filtrar();
    },

    filtrar: function() {
        const term = document.getElementById('search-user').value.toLowerCase();
        
        const lista = Gestao.dados.usuarios.filter(u => {
            const matchSearch = u.nome.toLowerCase().includes(term) || String(u.id).includes(term);
            const isRealmenteAtivo = (u.ativo !== false && u.contrato !== 'FINALIZADO');
            
            if (this.filtroAtual === 'ativos') return matchSearch && isRealmenteAtivo;
            return matchSearch && !isRealmenteAtivo;
        });

        this.renderizar(lista);
    },

    renderizar: function(lista) {
        const container = document.getElementById('user-list');
        if (!lista.length) return container.innerHTML = '<div class="p-10 text-center text-slate-400">Vazio.</div>';

        container.innerHTML = lista.map(u => {
            const json = JSON.stringify(u).replace(/"/g, '&quot;');
            let badge = '';
            
            if (u.contrato === 'FINALIZADO') badge = '<span class="ml-2 text-[10px] bg-red-100 text-red-700 px-1 rounded">FINALIZADO</span>';
            else if (u.ativo === false) badge = '<span class="ml-2 text-[10px] bg-gray-200 text-gray-600 px-1 rounded">INATIVO</span>';

            return `
            <div class="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg shadow-sm mb-2 hover:border-blue-300 transition">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 flex items-center justify-center bg-slate-100 rounded text-xs font-bold text-slate-600">${u.id}</div>
                    <div>
                        <div class="font-bold text-sm text-slate-700">${u.nome} ${badge}</div>
                        <div class="text-[10px] font-bold text-slate-400 tracking-wider">${u.funcao} • ${u.contrato || 'PJ'}</div>
                    </div>
                </div>
                <button onclick="Gestao.Equipe.abrirModal(${json})" class="text-slate-400 hover:text-blue-600 px-3 py-1 text-xs font-bold border border-slate-100 rounded hover:bg-slate-50">EDITAR</button>
            </div>`;
        }).join('');
    },

    popularSelectMetas: function() {
        const sel = document.getElementById('meta-user');
        if(!sel) return;
        sel.innerHTML = '<option value="">Selecione...</option><option value="all">TODOS</option>';
        Gestao.dados.usuarios
            .filter(u => u.funcao === 'Assistente' && u.ativo !== false && u.contrato !== 'FINALIZADO')
            .forEach(u => sel.innerHTML += `<option value="${u.id}">${u.nome}</option>`);
    },

    // --- IMPORTAÇÃO ESPECÍFICA DE ASSISTENTES ---
    importar: async function(input) {
        if (!input.files[0]) return;
        if (!confirm("Importar arquivo 'ASSISTENTES'?")) return;

        try {
            const res = await Importacao.lerArquivo(input);
            const updates = [];
            const inserts = [];
            const mapDb = {}; 
            Gestao.dados.usuarios.forEach(u => mapDb[u.id] = u);

            res.dados.forEach(row => {
                const keys = Object.keys(row);
                const norm = Importacao.normalizar;

                // Mapeia colunas do seu CSV (ID ASSISTENTE, NOME ASSIST, CONTRATO, SITUAÇÃO)
                const kId = keys.find(k => norm(k).includes('id') || norm(k).includes('matricula'));
                const kNome = keys.find(k => norm(k).includes('nome') || norm(k).includes('assistente'));
                const kContrato = keys.find(k => norm(k).includes('contrato'));
                const kSit = keys.find(k => norm(k).includes('situacao') || norm(k).includes('status'));

                if (!kId || !kNome) return;

                const id = parseInt(row[kId]);
                const nome = row[kNome] ? row[kNome].toString().trim() : "";
                
                if (!id || !nome || nome.toLowerCase() === 'total') return;

                // Tratamento de Contrato
                let rawContrato = kContrato && row[kContrato] ? row[kContrato].toString().toUpperCase().trim() : "PJ";
                let funcao = 'Assistente';
                let contrato = 'PJ';

                if (rawContrato === 'CLT') contrato = 'CLT';
                else if (rawContrato === 'FINALIZADO') contrato = 'FINALIZADO';
                else if (rawContrato.includes('AUDITORA')) { funcao = 'Auditora'; contrato = 'PJ'; }
                else if (rawContrato.includes('GESTORA')) { funcao = 'Gestora'; contrato = 'PJ'; }

                // Tratamento de Situação
                let rawSit = kSit && row[kSit] ? row[kSit].toString().toUpperCase().trim() : "ATIVO";
                // Lógica corrigida: Só é ativo se estiver escrito ATIVO e o contrato não for FINALIZADO
                let ativo = (rawSit === 'ATIVO' && contrato !== 'FINALIZADO');

                const payload = { id, nome, funcao, contrato, ativo };

                if (mapDb[id]) {
                    // Atualiza apenas se mudou algo
                    const u = mapDb[id];
                    if (u.nome !== nome || u.funcao !== funcao || u.contrato !== contrato || u.ativo !== ativo) {
                        updates.push(payload);
                    }
                } else {
                    inserts.push({ ...payload, senha: '123456' });
                }
            });

            // Executa no banco
            for(const u of updates) await Gestao.supabase.from('usuarios').update(u).eq('id', u.id);
            if(inserts.length) await Gestao.supabase.from('usuarios').insert(inserts);

            alert(`Importação concluída!\nNovos: ${inserts.length}\nAtualizados: ${updates.length}`);
            this.carregar();

        } catch (e) {
            console.error(e);
            alert("Erro: " + e.message);
        } finally {
            input.value = "";
        }
    },

    // Modal e CRUD
    abrirModal: function(user) {
        const m = document.getElementById('modal-user'); m.classList.remove('hidden'); m.classList.add('flex');
        const idInput = document.getElementById('form-user-id');
        if(user) {
            document.getElementById('modal-user-title').innerText = "Editar Colaborador";
            idInput.value = user.id; idInput.disabled = true;
            document.getElementById('form-user-nome').value = user.nome;
            document.getElementById('form-user-senha').value = user.senha;
            document.getElementById('form-user-funcao').value = user.funcao;
            document.getElementById('form-user-contrato').value = user.contrato || 'PJ';
            document.getElementById('form-user-ativo').value = (user.ativo !== false).toString();
            document.getElementById('btn-user-delete').classList.remove('hidden');
        } else {
            document.getElementById('modal-user-title').innerText = "Novo Colaborador";
            idInput.value = ""; idInput.disabled = false;
            document.getElementById('form-user-nome').value = "";
            document.getElementById('form-user-senha').value = "";
            document.getElementById('form-user-ativo').value = "true";
            document.getElementById('btn-user-delete').classList.add('hidden');
        }
    },

    salvar: async function() {
        const id = document.getElementById('form-user-id').value;
        const nome = document.getElementById('form-user-nome').value;
        const senha = document.getElementById('form-user-senha').value;
        const funcao = document.getElementById('form-user-funcao').value;
        const contrato = document.getElementById('form-user-contrato').value;
        const ativo = document.getElementById('form-user-ativo').value === 'true';

        if(!id || !nome) return alert("Preencha ID e Nome.");

        const payload = { id: parseInt(id), nome, senha, funcao, contrato, ativo };
        try {
            const query = document.getElementById('form-user-id').disabled 
                ? Gestao.supabase.from('usuarios').update(payload).eq('id', id)
                : Gestao.supabase.from('usuarios').insert(payload);
            
            const { error } = await query;
            if(error) throw error;
            Gestao.fecharModais(); this.carregar();
        } catch(e) { alert("Erro ao salvar: " + e.message); }
    },

    excluir: async function() {
        if(!confirm("Tem certeza que deseja excluir?")) return;
        try {
            const id = document.getElementById('form-user-id').value;
            await Gestao.supabase.from('usuarios').delete().eq('id', id);
            Gestao.fecharModais(); this.carregar();
        } catch(e) { alert("Erro: " + e.message); }
    }
};