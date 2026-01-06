Gestao.Equipe = {
    carregar: async function() {
        try {
            const { data, error } = await Gestao.supabase.from('usuarios').select('*').order('nome');
            if (error) throw error;
            Gestao.dados.usuarios = data || [];
            this.renderizar(Gestao.dados.usuarios);
            this.popularSelectMetas();
        } catch (err) {
            console.error("Erro ao carregar equipe:", err);
            document.getElementById('user-list').innerHTML = `<div class="p-4 text-center text-red-500">Erro de conexão.</div>`;
        }
    },

    renderizar: function(lista) {
        const container = document.getElementById('user-list');
        document.getElementById('total-users').innerText = lista.length;
        
        if (lista.length === 0) {
            container.innerHTML = '<div class="p-10 text-center text-slate-400">Nenhum colaborador encontrado.</div>';
            return;
        }

        let html = '';
        lista.forEach(u => {
            // Escapa aspas para passar no JSON do onclick
            const userJson = JSON.stringify(u).replace(/"/g, '&quot;');
            const icon = u.funcao === 'Gestora' ? '<i class="fas fa-user-shield text-purple-500"></i>' : '<i class="fas fa-user text-slate-400"></i>';
            
            html += `
            <div class="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 hover:border-blue-300 transition group shadow-sm">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-full text-xs font-bold text-slate-600 border border-slate-100">${u.id}</div>
                    <div>
                        <div class="font-bold text-sm text-slate-700 flex items-center gap-2">${u.nome} ${icon}</div>
                        <div class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">${u.funcao} • ${u.contrato || 'PJ'}</div>
                    </div>
                </div>
                <button onclick="Gestao.Equipe.abrirModal(${userJson})" class="text-slate-400 hover:text-blue-600 px-3 py-1 text-xs font-bold border border-slate-100 rounded hover:bg-slate-50 transition">
                    <i class="fas fa-pen"></i> Editar
                </button>
            </div>`;
        });
        container.innerHTML = html;
    },

    filtrar: function() {
        const term = document.getElementById('search-user').value.toLowerCase();
        const filtered = Gestao.dados.usuarios.filter(u => 
            u.nome.toLowerCase().includes(term) || String(u.id).includes(term)
        );
        this.renderizar(filtered);
    },

    popularSelectMetas: function() {
        const sel = document.getElementById('meta-user');
        if(!sel) return;
        sel.innerHTML = '<option value="">Selecione...</option>';
        sel.innerHTML += '<option value="all" class="font-bold text-blue-700 bg-blue-50">⭐ TODOS OS ASSISTENTES</option>';
        
        const assistentes = Gestao.dados.usuarios.filter(u => u.funcao === 'Assistente');
        assistentes.forEach(u => { 
            sel.innerHTML += `<option value="${u.id}">${u.nome}</option>`; 
        });
    },

    // --- IMPORTAÇÃO ---
    importar: async function(input) {
        const file = input.files[0];
        if (!file) return;
        if(!confirm("Deseja importar este arquivo? IDs existentes terão nome atualizado, novos serão criados.")) { input.value = ""; return; }

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
        const updates = []; const inserts = [];
        const mapDb = {}; 
        Gestao.dados.usuarios.forEach(u => mapDb[u.id] = u.nome);

        for (const row of linhas) {
            const keys = Object.keys(row);
            const kId = keys.find(k => ['id','id_assistente','matricula'].includes(norm(k)));
            const kNome = keys.find(k => norm(k).includes('nome') || norm(k).includes('assistente'));
            if (!kId || !kNome) continue;

            const id = parseInt(row[kId]); const nome = row[kNome] ? row[kNome].toString().trim() : "";
            if (!id || !nome || nome.toLowerCase() === 'total') continue;

            if (mapDb[id]) {
                if (norm(mapDb[id]) !== norm(nome)) updates.push({id, nome});
            } else {
                inserts.push({ id, nome, senha: '123456', funcao: 'Assistente', contrato: 'PJ', ativo: true });
            }
        }

        try {
            for (const u of updates) await Gestao.supabase.from('usuarios').update({nome: u.nome}).eq('id', u.id);
            if (inserts.length) await Gestao.supabase.from('usuarios').insert(inserts);
            alert(`Importação: ${inserts.length} criados, ${updates.length} atualizados.`);
            this.carregar();
        } catch (err) { alert("Erro BD: " + err.message); }
    },

    // --- MODAL ---
    abrirModal: function(user = null) {
        const m = document.getElementById('modal-user');
        m.classList.remove('hidden'); m.classList.add('flex');
        
        const btnDel = document.getElementById('btn-user-delete');
        const inputId = document.getElementById('form-user-id');
        
        if (user) {
            document.getElementById('modal-user-title').innerText = "Editar Colaborador";
            inputId.value = user.id; inputId.disabled = true; inputId.classList.add('bg-slate-100');
            document.getElementById('form-user-nome').value = user.nome;
            document.getElementById('form-user-senha').value = user.senha;
            document.getElementById('form-user-funcao').value = user.funcao;
            document.getElementById('form-user-contrato').value = user.contrato || 'PJ';
            btnDel.classList.remove('hidden');
        } else {
            document.getElementById('modal-user-title').innerText = "Novo Colaborador";
            inputId.value = ""; inputId.disabled = false; inputId.classList.remove('bg-slate-100');
            document.getElementById('form-user-nome').value = "";
            document.getElementById('form-user-senha').value = "";
            document.getElementById('form-user-funcao').value = "Assistente";
            document.getElementById('form-user-contrato').value = "PJ";
            btnDel.classList.add('hidden');
        }
    },

    salvar: async function() {
        const id = document.getElementById('form-user-id').value;
        const nome = document.getElementById('form-user-nome').value;
        const senha = document.getElementById('form-user-senha').value;
        const funcao = document.getElementById('form-user-funcao').value;
        const contrato = document.getElementById('form-user-contrato').value;
        
        if(!id || !nome) return alert("Campos obrigatórios.");
        const payload = { id: parseInt(id), nome, senha, funcao, contrato };
        
        try {
            if (document.getElementById('form-user-id').disabled) {
                 const { error } = await Gestao.supabase.from('usuarios').update(payload).eq('id', id);
                 if (error) throw error;
            } else {
                 const { error } = await Gestao.supabase.from('usuarios').insert(payload);
                 if (error) throw error;
            }
            Gestao.fecharModais(); this.carregar();
        } catch (e) { alert("Erro: " + e.message); }
    },

    excluir: async function() {
        const id = document.getElementById('form-user-id').value;
        if(!confirm("Excluir usuário?")) return;
        try {
            const { error } = await Gestao.supabase.from('usuarios').delete().eq('id', id);
            if (error) throw error;
            Gestao.fecharModais(); this.carregar();
        } catch (e) { alert("Erro: " + e.message); }
    }
};