Gestao.Usuarios = {
    listaCompleta: [],

    carregar: async function() {
        const tbody = document.getElementById('lista-usuarios');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8"><i class="fas fa-spinner fa-spin text-blue-500 text-xl"></i></td></tr>';
        
        const { data, error } = await Sistema.supabase.from('usuarios').select('*').order('nome');
        if (error) { console.error(error); return; }

        this.listaCompleta = data || [];
        this.filtrar(); 
    },

    filtrar: function() {
        const inputBusca = document.getElementById('search-usuarios');
        const checkInativos = document.getElementById('toggle-inativos');
        
        const termo = inputBusca ? inputBusca.value.toLowerCase().trim() : '';
        const exibirInativos = checkInativos ? checkInativos.checked : false;

        const filtrados = this.listaCompleta.filter(u => {
            if (!exibirInativos && !u.ativo) return false;
            
            if (termo) {
                const statusStr = u.ativo ? 'ativo' : 'inativo';
                const searchStr = `${u.id} ${u.nome} ${u.contrato} ${statusStr}`.toLowerCase();
                return searchStr.includes(termo);
            }
            return true;
        });

        this.renderizarTabela(filtrados);
    },

    renderizarTabela: function(lista) {
        const tbody = document.getElementById('lista-usuarios');
        const contador = document.getElementById('contador-usuarios');
        if (!tbody) return;

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400 flex flex-col items-center gap-2"><i class="fas fa-search text-3xl opacity-20"></i><span>Nenhum usuário encontrado.</span></td></tr>';
            if(contador) contador.innerText = '0 Registros';
            return;
        }

        let html = '';
        lista.forEach(u => {
            // SEGURANÇA: Sanitização dos dados antes de criar o HTML
            const nomeSafe = Sistema.escapar(u.nome);
            const contratoSafe = Sistema.escapar(u.contrato || '').toUpperCase();
            
            const isAtivo = u.ativo;
            const statusClass = isAtivo ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200';
            const statusLabel = isAtivo ? 'ATIVO' : 'INATIVO';

            let contratoClass = 'bg-slate-50 text-slate-600 border-slate-200';
            
            if (contratoSafe === 'CLT') contratoClass = 'bg-blue-50 text-blue-700 border-blue-200';
            else if (contratoSafe === 'PJ') contratoClass = 'bg-sky-50 text-sky-700 border-sky-200';
            else if (contratoSafe === 'AUDITORA') contratoClass = 'bg-purple-50 text-purple-700 border-purple-200';
            else if (contratoSafe === 'GESTORA') contratoClass = 'bg-pink-50 text-pink-700 border-pink-200';
            else if (contratoSafe === 'FINALIZADO') contratoClass = 'bg-gray-100 text-gray-500 border-gray-200';

            // Preparamos o objeto para o botão editar (escapando aspas para não quebrar o HTML do onclick)
            const userJson = JSON.stringify(u).replace(/"/g, '&quot;');

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-sm group">
                <td class="px-4 py-3 font-mono text-slate-500 font-bold group-hover:text-blue-600 transition">#${u.id}</td>
                <td class="px-4 py-3 font-bold text-slate-700">
                    ${nomeSafe}
                    ${!isAtivo ? '<span class="ml-2 text-[10px] text-slate-400 font-normal italic">(Inativo)</span>' : ''}
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${contratoClass}">${contratoSafe}</span>
                </td>
                <td class="px-4 py-3 text-center">
                    <span class="px-2 py-1 rounded text-xs font-bold border ${statusClass}">${statusLabel}</span>
                </td>
                <td class="px-4 py-3 text-right flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="Gestao.Usuarios.abrirModal(${userJson})" class="p-1.5 text-blue-500 hover:bg-blue-50 rounded transition" title="Editar"><i class="fas fa-edit"></i></button>
                    <button onclick="Gestao.Usuarios.excluir(${u.id})" class="p-1.5 text-red-400 hover:bg-red-50 rounded transition" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
        if(contador) contador.innerText = `${lista.length} Registros listados`;
    },

    abrirModal: function(usuario = null) {
        const isEdit = !!usuario;
        const modalAntigo = document.getElementById('modal-usuario');
        if(modalAntigo) modalAntigo.remove();

        // SEGURANÇA: Inputs também precisam exibir dados sanitizados
        const nomeVal = usuario ? Sistema.escapar(usuario.nome) : '';
        const idVal = usuario ? usuario.id : '';

        const modalHtml = `
        <div id="modal-usuario" class="fixed inset-0 bg-slate-900/40 z-[70] flex items-center justify-center backdrop-blur-sm animate-fade">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                <div class="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 class="text-lg font-bold text-slate-800">${isEdit ? 'Editar Usuário' : 'Novo Usuário'}</h3>
                    <button onclick="document.getElementById('modal-usuario').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="p-6 space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1">ID (Único)</label>
                        <input type="number" id="inp-id" value="${idVal}" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition" ${isEdit ? 'disabled class="bg-slate-100 text-slate-500 w-full border border-slate-200 rounded-lg p-2.5 text-sm"' : ''} placeholder="Ex: 102030">
                        ${!isEdit ? '<p class="text-[10px] text-slate-400 mt-1">O ID será usado para login e não pode ser alterado depois.</p>' : ''}
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Nome Completo</label>
                        <input type="text" id="inp-nome" value="${nomeVal}" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition" placeholder="Nome do colaborador">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Contrato</label>
                            <select id="inp-contrato" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-blue-500">
                                <option value="CLT">CLT</option>
                                <option value="PJ">PJ</option>
                                <option value="AUDITORA">AUDITORA</option>
                                <option value="GESTORA">GESTORA</option>
                                <option value="FINALIZADO">FINALIZADO</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
                            <select id="inp-situacao" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-blue-500">
                                <option value="true">ATIVO</option>
                                <option value="false">INATIVO</option>
                            </select>
                        </div>
                    </div>
                    ${isEdit ? `
                    <div class="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100 flex items-center gap-3">
                        <input type="checkbox" id="inp-reset-senha" class="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500">
                        <label for="inp-reset-senha" class="text-xs font-bold text-amber-800 cursor-pointer select-none">Resetar senha para "gupy123"</label>
                    </div>` : ''}
                </div>

                <div class="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                    <button onclick="document.getElementById('modal-usuario').remove()" class="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-bold text-sm transition">Cancelar</button>
                    <button onclick="Gestao.Usuarios.salvar(${isEdit})" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm shadow-md transition active:scale-95">Salvar Usuário</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if (usuario) {
            document.getElementById('inp-contrato').value = usuario.contrato || 'CLT';
            document.getElementById('inp-situacao').value = usuario.ativo.toString();
        }
    },

    salvar: async function(isEdit) {
        const id = document.getElementById('inp-id').value;
        const nome = document.getElementById('inp-nome').value;
        const contrato = document.getElementById('inp-contrato').value;
        const ativo = document.getElementById('inp-situacao').value === 'true';
        const resetSenha = document.getElementById('inp-reset-senha')?.checked;

        if (!id || !nome) return alert("Preencha ID e Nome.");

        let funcao = 'ASSISTENTE';
        if (contrato.includes('AUDITORA')) funcao = 'AUDITORA';
        if (contrato.includes('GESTORA')) funcao = 'GESTORA';

        const payload = {
            id: parseInt(id),
            nome: nome.trim(),
            contrato: contrato,
            ativo: ativo,
            funcao: funcao,
            perfil: (funcao === 'GESTORA' ? 'admin' : 'user')
        };

        // NOTA DO BOARD: A senha aqui agora é tratada apenas como hash para update.
        // O ideal seria que o backend (RPC) fizesse isso, mas vamos manter o fluxo simples.
        if (!isEdit || resetSenha) {
             // Reutilizando uma função local de hash para o update (temporário até Fase 2 completa)
             const msgBuffer = new TextEncoder().encode('gupy123');
             const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
             const hashArray = Array.from(new Uint8Array(hashBuffer));
             payload.senha = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        const { error } = await Sistema.supabase.from('usuarios').upsert(payload);
        if (error) alert("Erro: " + error.message);
        else {
            const modal = document.getElementById('modal-usuario');
            if(modal) modal.remove();
            this.carregar();
        }
    },

    excluir: async function(id) {
        if (!confirm(`Confirma a exclusão do usuário ${id}?`)) return;
        const { error } = await Sistema.supabase.from('usuarios').delete().eq('id', id);
        if (error) alert("Erro ao excluir. Tente inativar.");
        else this.carregar();
    }
};