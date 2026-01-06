Gestao.Equipe = {
    filtroAtual: 'ativos',
    
    carregar: async function() {
        const { data } = await Gestao.supabase.from('usuarios').select('*').order('nome');
        Gestao.dados.usuarios = data || [];
        this.atualizarContadores();
        this.filtrar();
        this.popularSelectMetas();
    },

    atualizarContadores: function() {
        const ativos = Gestao.dados.usuarios.filter(u => u.ativo !== false && u.contrato !== 'FINALIZADO').length;
        document.getElementById('count-ativos').innerText = ativos;
        document.getElementById('count-inativos').innerText = Gestao.dados.usuarios.length - ativos;
    },

    mudarFiltro: function(novo) {
        this.filtroAtual = novo;
        document.getElementById('btn-sub-ativos').className = `sub-tab-btn flex-1 py-2 text-sm font-bold text-center text-emerald-600 ${novo === 'ativos' ? 'active' : ''}`;
        document.getElementById('btn-sub-inativos').className = `sub-tab-btn flex-1 py-2 text-sm font-bold text-center text-red-600 ${novo === 'inativos' ? 'active' : ''}`;
        this.filtrar();
    },

    filtrar: function() {
        const term = document.getElementById('search-user').value.toLowerCase();
        const lista = Gestao.dados.usuarios.filter(u => {
            const matchText = u.nome.toLowerCase().includes(term) || String(u.id).includes(term);
            const isAtivo = (u.ativo !== false && u.contrato !== 'FINALIZADO');
            return matchText && (this.filtroAtual === 'ativos' ? isAtivo : !isAtivo);
        });
        
        const container = document.getElementById('user-list');
        container.innerHTML = lista.map(u => {
            const json = JSON.stringify(u).replace(/"/g, '&quot;');
            const isFin = u.contrato === 'FINALIZADO';
            const label = isFin ? '<span class="ml-2 text-[10px] bg-red-100 text-red-600 px-1 rounded border border-red-200">FINALIZADO</span>' : (!u.ativo ? '<span class="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1 rounded">INATIVO</span>' : '');
            return `<div class="flex justify-between items-center p-3 bg-white border border-slate-200 rounded-lg mb-2 shadow-sm ${!u.ativo || isFin ? 'opacity-70 bg-slate-50' : ''}">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 flex justify-center items-center bg-slate-100 rounded text-xs font-bold">${u.id}</div>
                    <div><div class="font-bold text-sm text-slate-700">${u.nome} ${label}</div><div class="text-[10px] font-bold text-slate-400">${u.funcao} • ${u.contrato}</div></div>
                </div>
                <button onclick="Gestao.Equipe.abrirModal(${json})" class="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded text-xs font-bold">Editar</button>
            </div>`;
        }).join('') || '<div class="p-10 text-center text-slate-400">Nada encontrado.</div>';
    },

    popularSelectMetas: function() {
        const sel = document.getElementById('meta-user');
        sel.innerHTML = '<option value="">Selecione...</option><option value="all">TODOS</option>';
        Gestao.dados.usuarios.filter(u => u.funcao === 'Assistente' && u.ativo !== false && u.contrato !== 'FINALIZADO')
            .forEach(u => sel.innerHTML += `<option value="${u.id}">${u.nome}</option>`);
    },

    importar: async function(input) {
        if (!input.files[0]) return;
        if(!confirm("Importar Assistentes?")) return;
        
        try {
            const res = await Importacao.lerArquivo(input);
            const updates = []; const inserts = [];
            const mapDb = {}; Gestao.dados.usuarios.forEach(u => mapDb[u.id] = u);

            res.dados.forEach(row => {
                const k = Object.keys(row);
                const kId = k.find(x => x.toLowerCase().includes('id'));
                const kNome = k.find(x => x.toLowerCase().includes('nome') || x.toLowerCase().includes('assistente'));
                const kContrato = k.find(x => x.toLowerCase().includes('contrato'));
                const kSit = k.find(x => x.toLowerCase().includes('sit') || x.toLowerCase().includes('status'));

                if (!kId || !kNome) return;
                const id = parseInt(row[kId]);
                const nome = row[kNome];
                if (!id || !nome) return;

                let contrato = kContrato ? row[kContrato].toString().toUpperCase() : 'PJ';
                let funcao = 'Assistente';
                
                if (contrato === 'CLT') contrato = 'CLT';
                else if (contrato === 'FINALIZADO') contrato = 'FINALIZADO';
                else if (contrato.includes('AUDITORA')) { funcao = 'Auditora'; contrato = 'PJ'; }
                else if (contrato.includes('GESTORA')) { funcao = 'Gestora'; contrato = 'PJ'; }
                else contrato = 'PJ';

                const rawSit = kSit ? row[kSit].toString().toUpperCase() : 'ATIVO';
                const ativo = (rawSit === 'ATIVO' && contrato !== 'FINALIZADO');

                const payload = { id, nome, funcao, contrato, ativo };
                
                if (mapDb[id]) {
                    if (JSON.stringify({id, nome, funcao, contrato, ativo}) !== JSON.stringify({id, nome: mapDb[id].nome, funcao: mapDb[id].funcao, contrato: mapDb[id].contrato, ativo: mapDb[id].ativo})) {
                        updates.push(payload);
                    }
                } else {
                    inserts.push({ ...payload, senha: '123456' });
                }
            });

            for(const u of updates) await Gestao.supabase.from('usuarios').update(u).eq('id', u.id);
            if(inserts.length) await Gestao.supabase.from('usuarios').insert(inserts);
            
            alert(`Importação: ${inserts.length} novos, ${updates.length} atualizados.`);
            this.carregar();
        } catch(e) { alert("Erro: " + e); }
        input.value = "";
    },

    abrirModal: function(user) {
        const m = document.getElementById('modal-user'); m.classList.remove('hidden'); m.classList.add('flex');
        const idInput = document.getElementById('form-user-id');
        if(user) {
            document.getElementById('modal-user-title').innerText = "Editar";
            idInput.value = user.id; idInput.disabled = true;
            document.getElementById('form-user-nome').value = user.nome;
            document.getElementById('form-user-senha').value = user.senha;
            document.getElementById('form-user-funcao').value = user.funcao;
            document.getElementById('form-user-contrato').value = user.contrato || 'PJ';
            document.getElementById('form-user-ativo').value = (user.ativo !== false).toString();
            document.getElementById('btn-user-delete').classList.remove('hidden');
        } else {
            document.getElementById('modal-user-title').innerText = "Novo";
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
        
        const payload = { id: parseInt(id), nome, senha, funcao, contrato, ativo };
        const method = document.getElementById('form-user-id').disabled ? 'update' : 'insert';
        const query = Gestao.supabase.from('usuarios')[method](payload);
        if(method === 'update') query.eq('id', id);
        
        const { error } = await query;
        if(error) return alert("Erro: " + error.message);
        Gestao.fecharModais(); this.carregar();
    },

    excluir: async function() {
        if(!confirm("Excluir usuário?")) return;
        await Gestao.supabase.from('usuarios').delete().eq('id', document.getElementById('form-user-id').value);
        Gestao.fecharModais(); this.carregar();
    }
};