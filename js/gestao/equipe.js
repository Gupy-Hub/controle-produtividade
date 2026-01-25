Gestao.Equipe = {
    filtroAtual: 'ativos',
    idsSelecionados: new Set(),

    carregar: async function() {
        try {
            const { data, error } = await Gestao.supabase.from('usuarios').select('*').order('nome');
            if (error) throw error;
            Gestao.dados.usuarios = data || [];
            this.idsSelecionados.clear();
            this.atualizarContadores();
            this.filtrar(); 
            this.popularSelectMetas();
            this.atualizarBotaoExclusaoMassa();
        } catch (err) { console.error("Erro equipe:", err); }
    },

    atualizarContadores: function() {
        const ativos = Gestao.dados.usuarios.filter(u => u.ativo !== false && u.contrato !== 'FINALIZADO').length;
        document.getElementById('count-ativos').innerText = ativos;
        document.getElementById('count-inativos').innerText = Gestao.dados.usuarios.length - ativos;
    },

    mudarFiltro: function(novo) {
        this.filtroAtual = novo;
        this.idsSelecionados.clear(); 
        this.atualizarBotaoExclusaoMassa();
        
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

            const isSelected = this.idsSelecionados.has(u.id);

            return `
            <div class="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg shadow-sm mb-2 hover:border-blue-300 transition ${isSelected ? 'bg-blue-50 border-blue-300' : ''}">
                <div class="flex items-center gap-3">
                    <div class="pl-2">
                        <input type="checkbox" onchange="Gestao.Equipe.toggleSelecao(${u.id})" ${isSelected ? 'checked' : ''} class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer">
                    </div>
                    <div class="w-8 h-8 flex items-center justify-center bg-slate-100 rounded text-xs font-bold text-slate-600">${u.id}</div>
                    <div>
                        <div class="font-bold text-sm text-slate-700">${u.nome} ${badge}</div>
                        <div class="text-[10px] font-bold text-slate-400 tracking-wider">${u.funcao} • ${u.contrato || 'PJ'}</div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="Gestao.Equipe.excluirIndividual(${u.id})" class="text-red-400 hover:text-red-600 px-3 py-1 text-xs font-bold border border-transparent hover:bg-red-50 rounded" title="Excluir"><i class="fas fa-trash"></i></button>
                    <button onclick="Gestao.Equipe.abrirModal(${json})" class="text-slate-400 hover:text-blue-600 px-3 py-1 text-xs font-bold border border-slate-100 rounded hover:bg-slate-50">EDITAR</button>
                </div>
            </div>`;
        }).join('');
    },

    // --- SELEÇÃO ---
    toggleSelecao: function(id) {
        if (this.idsSelecionados.has(id)) this.idsSelecionados.delete(id);
        else this.idsSelecionados.add(id);
        this.filtrar(); 
        this.atualizarBotaoExclusaoMassa();
    },

    toggleSelecionarTodos: function(checkbox) {
        const term = document.getElementById('search-user').value.toLowerCase();
        const listaVisivel = Gestao.dados.usuarios.filter(u => {
            const matchSearch = u.nome.toLowerCase().includes(term) || String(u.id).includes(term);
            const isAtivo = (u.ativo !== false && u.contrato !== 'FINALIZADO');
            return matchSearch && (this.filtroAtual === 'ativos' ? isAtivo : !isAtivo);
        });

        if (checkbox.checked) {
            listaVisivel.forEach(u => this.idsSelecionados.add(u.id));
        } else {
            listaVisivel.forEach(u => this.idsSelecionados.delete(u.id));
        }
        this.filtrar();
        this.atualizarBotaoExclusaoMassa();
    },

    atualizarBotaoExclusaoMassa: function() {
        const btn = document.getElementById('btn-delete-mass-equipe');
        const countSpan = document.getElementById('count-sel-equipe');
        const count = this.idsSelecionados.size;
        
        if (countSpan) countSpan.innerText = count;
        if (btn) {
            if (count > 0) {
                btn.classList.remove('hidden'); btn.classList.add('flex');
            } else {
                btn.classList.add('hidden'); btn.classList.remove('flex');
            }
        }
    },

    // --- NOVA LÓGICA DE EXCLUSÃO INTELIGENTE ---
    excluirMassa: async function() {
        const ids = Array.from(this.idsSelecionados);
        const count = ids.length;
        
        if (!confirm(`Deseja tentar excluir ${count} colaboradores selecionados?\n\nColaboradores com histórico de produção NÃO serão excluídos, apenas removidos da seleção.`)) return;

        // Feedback visual
        const btn = document.getElementById('btn-delete-mass-equipe');
        const txtOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
        btn.disabled = true;

        let excluidos = 0;
        let mantidos = 0;

        // Processa um por um para garantir que erros individuais não travem o lote
        for (const id of ids) {
            const { error } = await Gestao.supabase.from('usuarios').delete().eq('id', id);
            
            if (error) {
                // Se deu erro (ex: constraint de chave estrangeira), conta como mantido
                mantidos++;
            } else {
                // Sucesso
                excluidos++;
                this.idsSelecionados.delete(id); // Remove da seleção
            }
        }

        // Restaura botão
        btn.innerHTML = txtOriginal;
        btn.disabled = false;

        alert(`Processo finalizado!\n\n✅ Excluídos com sucesso: ${excluidos}\n🔒 Mantidos (possuem histórico): ${mantidos}`);
        
        this.carregar();
    },

    excluirIndividual: async function(id) {
        if(!confirm("Deseja excluir este usuário permanentemente?")) return;
        try {
            const { error } = await Gestao.supabase.from('usuarios').delete().eq('id', id);
            if (error) throw new Error("Não é possível excluir usuário com histórico de produção. Tente inativá-lo.");
            this.carregar();
        } catch(e) { alert("Erro: " + e.message); }
    },

    // --- IMPORTAÇÃO ---
    importar: async function(input) {
        const file = input.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().startsWith('assistentes')) {
            alert("⚠️ Arquivo inválido!\nO nome do arquivo deve começar com 'Assistentes'.");
            input.value = ""; return;
        }

        if (!confirm("Confirmar importação de 'ASSISTENTES'?")) { input.value = ""; return; }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                let workbook;
                try { workbook = XLSX.read(data, { type: 'array' }); } 
                catch { const dec = new TextDecoder('iso-8859-1'); workbook = XLSX.read(dec.decode(data), { type: 'string', raw: true }); }
                
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet);
                await this.processarImportacao(json);
            } catch (err) { alert("Erro arquivo: " + err.message); }
            input.value = "";
        };
        reader.readAsArrayBuffer(file);
    },

    processarImportacao: async function(linhas) {
        const norm = t => t ? t.toString().toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, "") : "";
        const updates = []; 
        const inserts = [];
        const mapDb = {}; 
        Gestao.dados.usuarios.forEach(u => mapDb[u.id] = u); 

        for (const row of linhas) {
            const keys = Object.keys(row);
            const kId = keys.find(k => ['id assistente', 'id', 'matricula'].includes(norm(k)));
            const kNome = keys.find(k => ['nome assist', 'assistente', 'nome'].includes(norm(k)));
            const kContrato = keys.find(k => ['contrato'].includes(norm(k)));
            const kSituacao = keys.find(k => ['situacao', 'status'].includes(norm(k)));

            if (!kId || !kNome) continue;

            const id = parseInt(row[kId]);
            const nome = row[kNome] ? row[kNome].toString().trim() : "";
            
            if (!id || !nome || nome.toLowerCase() === 'total') continue;

            let rawContrato = kContrato && row[kContrato] ? row[kContrato].toString().toUpperCase().trim() : "PJ";
            let funcao = 'Assistente';
            let contrato = 'PJ';

            if (rawContrato === 'CLT') contrato = 'CLT';
            else if (rawContrato === 'FINALIZADO') contrato = 'FINALIZADO';
            else if (rawContrato.includes('AUDITORA')) { funcao = 'Auditora'; contrato = 'PJ'; }
            else if (rawContrato.includes('GESTORA')) { funcao = 'Gestora'; contrato = 'PJ'; }

            let rawSit = kSituacao && row[kSituacao] ? row[kSituacao].toString().toUpperCase().trim() : "ATIVO";
            let ativo = (rawSit === 'ATIVO' && contrato !== 'FINALIZADO');

            const payload = { id, nome, funcao, contrato, ativo };

            if (mapDb[id]) {
                const u = mapDb[id];
                if (u.nome !== nome || u.funcao !== funcao || u.contrato !== contrato || u.ativo !== ativo) {
                    updates.push(payload);
                }
            } else {
                inserts.push({ ...payload, senha: '123456' });
            }
        }

        try {
            let countUpd = 0;
            // Updates um a um para evitar problemas
            for (const u of updates) {
                await Gestao.supabase.from('usuarios').update(u).eq('id', u.id);
                countUpd++;
            }
            if(inserts.length) await Gestao.supabase.from('usuarios').insert(inserts);

            alert(`Concluído!\n\n🆕 Novos: ${inserts.length}\n🔄 Atualizados: ${countUpd}`);
            this.carregar();
        } catch (err) { alert("Erro Geral: " + err.message); }
    },

    popularSelectMetas: function() {
        const sel = document.getElementById('meta-user');
        if(!sel) return;
        sel.innerHTML = '<option value="">Selecione...</option><option value="all">TODOS</option>';
        Gestao.dados.usuarios
            .filter(u => u.funcao === 'Assistente' && u.ativo !== false && u.contrato !== 'FINALIZADO')
            .forEach(u => sel.innerHTML += `<option value="${u.id}">${u.nome}</option>`);
    },

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
        if(!confirm("Deseja excluir?")) return;
        try {
            const id = document.getElementById('form-user-id').value;
            const { error } = await Gestao.supabase.from('usuarios').delete().eq('id', id);
            if (error) throw new Error("Não é possível excluir usuário com histórico.");
            Gestao.fecharModais(); this.carregar();
        } catch(e) { alert(e.message); }
    }
};