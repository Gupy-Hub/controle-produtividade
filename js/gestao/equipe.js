Gestao.Equipe = {
    carregar: async function() {
        try {
            // Carrega e ordena por nome
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
            const userJson = JSON.stringify(u).replace(/"/g, '&quot;');
            
            // Ícone baseando na função
            let iconClass = 'fa-user text-slate-400';
            if (u.funcao === 'Gestora') iconClass = 'fa-user-shield text-purple-500';
            if (u.funcao === 'Auditora') iconClass = 'fa-search text-orange-500';

            // Estilo visual para desativados
            const opacityClass = u.ativo ? '' : 'opacity-60 grayscale bg-slate-100';
            const statusLabel = u.ativo ? '' : '<span class="ml-2 text-[10px] bg-red-100 text-red-600 px-1 rounded border border-red-200">INATIVO</span>';

            html += `
            <div class="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 hover:border-blue-300 transition group shadow-sm ${opacityClass}">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-full text-xs font-bold text-slate-600 border border-slate-100">${u.id}</div>
                    <div>
                        <div class="font-bold text-sm text-slate-700 flex items-center gap-2">
                            ${u.nome} <i class="fas ${iconClass}"></i> ${statusLabel}
                        </div>
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
        
        // Filtra apenas assistentes ATIVOS para a meta
        const assistentes = Gestao.dados.usuarios.filter(u => u.funcao === 'Assistente' && u.ativo);
        assistentes.forEach(u => { 
            sel.innerHTML += `<option value="${u.id}">${u.nome}</option>`; 
        });
    },

    // --- IMPORTAÇÃO ---
    importar: async function(input) {
        const file = input.files[0];
        if (!file) return;
        if(!confirm("Confirmar importação de 'ASSISTENTES'?\n\nIsso atualizará nomes, funções, contratos e inativará quem estiver com situação diferente de 'ATIVO'.")) { input.value = ""; return; }

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
        Gestao.dados.usuarios.forEach(u => mapDb[u.id] = u); // Mapeia objeto completo para comparação

        for (const row of linhas) {
            const keys = Object.keys(row);
            
            // 1. Identificar Colunas (Baseado no CSV enviado)
            const kId = keys.find(k => ['id assistente', 'id', 'matricula'].includes(norm(k)));
            const kNome = keys.find(k => ['nome assist', 'assistente', 'nome'].includes(norm(k)));
            const kContrato = keys.find(k => ['contrato'].includes(norm(k)));
            const kSituacao = keys.find(k => ['situacao', 'status'].includes(norm(k)));

            if (!kId || !kNome) continue;

            const id = parseInt(row[kId]);
            const nome = row[kNome] ? row[kNome].toString().trim() : "";
            const rawContrato = kContrato && row[kContrato] ? row[kContrato].toString().toUpperCase().trim() : "PJ";
            const rawSituacao = kSituacao && row[kSituacao] ? row[kSituacao].toString().toUpperCase().trim() : "ATIVO";

            if (!id || !nome || nome.toLowerCase() === 'total') continue;

            // 2. Lógica de Função e Contrato
            let funcao = 'Assistente';
            let contrato = 'PJ';
            
            if (rawContrato === 'CLT') contrato = 'CLT';
            else if (rawContrato === 'AUDITORA') { funcao = 'Auditora'; contrato = 'PJ'; } // Assume PJ para cargos especiais se não especificado
            else if (rawContrato === 'GESTORA') { funcao = 'Gestora'; contrato = 'PJ'; }
            
            // 3. Lógica de Ativo/Inativo
            const ativo = rawSituacao === 'ATIVO';

            const payload = {
                id: id,
                nome: nome,
                funcao: funcao,
                contrato: contrato,
                ativo: ativo
            };

            // 4. Verifica se precisa atualizar ou criar
            if (mapDb[id]) {
                const uDb = mapDb[id];
                // Atualiza se houver qualquer diferença
                if (norm(uDb.nome) !== norm(nome) || uDb.funcao !== funcao || uDb.contrato !== contrato || uDb.ativo !== ativo) {
                    updates.push(payload);
                }
            } else {
                // Novo usuário (Senha padrão)
                payload.senha = '123456'; 
                inserts.push(payload);
            }
        }

        try {
            // Atualizações (um por um para garantir segurança dos campos não mapeados)
            let countUpd = 0;
            for (const u of updates) {
                await Gestao.supabase.from('usuarios').update({
                    nome: u.nome,
                    funcao: u.funcao,
                    contrato: u.contrato,
                    ativo: u.ativo
                }).eq('id', u.id);
                countUpd++;
            }

            // Inserções em lote
            if (inserts.length) await Gestao.supabase.from('usuarios').insert(inserts);

            alert(`Processamento Concluído!\n\n🆕 Novos: ${inserts.length}\n🔄 Atualizados: ${countUpd}`);
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
        const payload = { id: parseInt(id), nome, senha, funcao, contrato, ativo: true };
        
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
        // Soft delete (apenas inativa) é mais seguro, mas aqui segue exclusão física conforme pedido
        if(!confirm("Tem certeza? Isso apagará o histórico de produção deste usuário! \n\nRecomendamos apenas mudar o contrato ou senha.")) return;
        
        try {
            const { error } = await Gestao.supabase.from('usuarios').delete().eq('id', id);
            if (error) throw error;
            Gestao.fecharModais(); this.carregar();
        } catch (e) { alert("Erro: " + e.message); }
    }
};