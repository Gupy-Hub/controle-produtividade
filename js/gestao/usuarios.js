Gestao.Usuarios = {
    estado: {
        lista: [],
        editandoId: null
    },

    init: function() {
        this.carregar();
    },

    carregar: async function() {
        const tbody = document.getElementById('lista-usuarios');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12"><i class="fas fa-spinner fa-spin text-blue-500 text-2xl"></i></td></tr>';

        const { data, error } = await Sistema.supabase
            .from('usuarios')
            .select('*')
            .order('nome');

        if (error) {
            console.error(error);
            alert("Erro ao carregar usuários: " + error.message);
            return;
        }

        this.estado.lista = data || [];
        this.filtrar();
    },

    filtrar: function() {
        const termo = document.getElementById('search-usuarios') ? document.getElementById('search-usuarios').value.toLowerCase() : '';
        const checkInativos = document.getElementById('toggle-inativos');
        const mostrarInativos = checkInativos ? checkInativos.checked : false;

        const filtrados = this.estado.lista.filter(u => {
            const matchTexto = (u.nome || '').toLowerCase().includes(termo) || String(u.id).includes(termo);
            const matchStatus = mostrarInativos ? true : u.ativo === true;
            return matchTexto && matchStatus;
        });

        this.renderizar(filtrados);
    },

    renderizar: function(lista) {
        const tbody = document.getElementById('lista-usuarios');
        const contador = document.getElementById('contador-usuarios');
        if (!tbody) return;

        tbody.innerHTML = '';
        
        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400 italic">Nenhum usuário encontrado.</td></tr>';
            if(contador) contador.innerText = '0 usuários';
            return;
        }

        let html = '';
        lista.forEach(item => {
            const contratoClass = item.contrato === 'PJ' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-slate-50 text-slate-600 border-slate-200';
            const statusClass = item.ativo ? 'bg-emerald-500 shadow-emerald-200 shadow-[0_0_8px]' : 'bg-slate-300';
            const rowClass = item.ativo ? '' : 'opacity-60 bg-slate-50 grayscale';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition group ${rowClass}">
                <td class="px-6 py-4 font-mono text-slate-400 text-xs">#${item.id}</td>
                <td class="px-6 py-4 font-bold text-slate-700">
                    ${item.nome}
                    <div class="text-[10px] text-slate-400 font-normal mt-0.5 uppercase tracking-wide">${item.funcao || 'Sem função'}</div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded text-[10px] font-bold border ${contratoClass}">${item.contrato || 'ND'}</span>
                </td>
                <td class="px-6 py-4 text-center cursor-pointer select-none" onclick="Gestao.Usuarios.toggleStatus('${item.id}', ${item.ativo})" title="Clique para alterar status">
                    <div class="flex items-center justify-center gap-2 border border-slate-100 rounded-full px-2 py-1 bg-white hover:border-blue-200 transition">
                        <span class="w-2 h-2 rounded-full inline-block ${statusClass}"></span>
                        <span class="text-[10px] font-bold ${item.ativo ? 'text-emerald-600' : 'text-slate-400'}">${item.ativo ? 'Ativo' : 'Inativo'}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-right flex justify-end gap-2 items-center">
                    <button id="btn-reset-${item.id}" onclick="Gestao.Usuarios.resetarSenhaManual('${item.id}', '${item.nome}')" 
                        class="text-amber-500 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 p-2 rounded-lg transition shadow-sm border border-amber-100 active:scale-95" 
                        title="Redefinir Senha Manualmente">
                        <i class="fas fa-key"></i>
                    </button>

                    <button onclick="Gestao.Usuarios.abrirModal('${item.id}')" 
                        class="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-2 rounded-lg transition shadow-sm border border-blue-100 active:scale-95"
                        title="Editar Usuário">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
        if(contador) contador.innerText = `${lista.length} usuários listados`;
    },

    // --- MANIPULAÇÃO DE DADOS ---

    abrirModal: function(id = null) {
        // Implementação simplificada de prompt (Ideal seria um modal HTML real)
        // Se já tiver modal no HTML, adaptar aqui.
        // Como o foco era o reset, vou manter o fluxo básico.
        
        let nome = '';
        let funcao = 'Assistente';
        let contrato = 'CLT';
        
        if(id) {
            const user = this.estado.lista.find(u => u.id == id);
            if(user) {
                nome = user.nome;
                funcao = user.funcao;
                contrato = user.contrato;
            }
        }

        // Aqui, para ser rápido, usamos Prompts, mas recomendo criar um <dialog> no HTML depois.
        const novoNome = prompt("Nome do Usuário:", nome);
        if(novoNome === null) return;

        const novaFuncao = prompt("Função (Assistente, Auditora, Gestora):", funcao);
        if(novaFuncao === null) return;

        const novoContrato = prompt("Contrato (CLT ou PJ):", contrato);
        if(novoContrato === null) return;

        this.salvar(id, novoNome, novaFuncao, novoContrato);
    },

    salvar: async function(id, nome, funcao, contrato) {
        if(!nome) return alert("Nome é obrigatório");

        const payload = {
            nome: nome,
            funcao: funcao,
            contrato: contrato,
            ativo: true
        };

        let error = null;

        if (id) {
            // Atualizar
            const res = await Sistema.supabase.from('usuarios').update(payload).eq('id', id);
            error = res.error;
        } else {
            // Criar Novo
            const res = await Sistema.supabase.from('usuarios').insert(payload);
            error = res.error;
        }

        if (error) {
            alert("Erro ao salvar: " + error.message);
        } else {
            this.carregar();
        }
    },

    toggleStatus: async function(id, statusAtual) {
        if (!confirm(`Deseja ${statusAtual ? 'desativar' : 'ativar'} este usuário?`)) return;

        const { error } = await Sistema.supabase
            .from('usuarios')
            .update({ ativo: !statusAtual })
            .eq('id', id);

        if (error) {
            alert("Erro: " + error.message);
        } else {
            this.carregar();
        }
    },

    // --- NOVA FUNÇÃO: RESET DE SENHA ---
    resetarSenhaManual: async function(id, nome) {
        // 1. Confirmação Simples
        const confirmacao = confirm(`⚠️ ATENÇÃO:\n\nDeseja resetar a senha de ${nome} para "gupy123"?\n\nO usuário será obrigado a trocar a senha no próximo login.`);
        
        if (!confirmacao) return;

        // Feedback Visual (opcional, mas bom)
        const btn = document.activeElement; // Pega o botão clicado
        const textoOriginal = btn ? btn.innerHTML : '';
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            // 2. Chama a nova função SQL (sem passar senha, o banco já sabe que é gupy123)
            const { error } = await Sistema.supabase.rpc('admin_resetar_senha', { 
                p_usuario_id: parseInt(id)
            });

            if (error) throw error;

            alert(`✅ Sucesso!\n\nA senha de ${nome} foi redefinida para: gupy123\nEle(a) será solicitado a trocar no próximo acesso.`);

        } catch (error) {
            console.error("Erro Reset:", error);
            alert("Erro ao resetar senha: " + (error.message || error.details));
        } finally {
            if(btn) btn.innerHTML = textoOriginal;
        }
    }
};