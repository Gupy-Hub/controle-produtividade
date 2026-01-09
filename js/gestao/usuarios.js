Gestao.Usuarios = {
    listaCompleta: [], // Armazena todos os dados para filtrar sem ir ao banco

    carregar: async function() {
        const tbody = document.getElementById('lista-usuarios');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8"><i class="fas fa-spinner fa-spin text-blue-500 text-xl"></i></td></tr>';
        
        // 1. Busca dados no Banco
        const { data, error } = await Sistema.supabase.from('usuarios').select('*').order('nome');
        if (error) { console.error(error); return; }

        // 2. Salva na memória e renderiza
        this.listaCompleta = data || [];
        this.filtrar(); // Chama a primeira renderização (aplicando filtros padrões)
    },

    // --- NOVA FUNÇÃO DE FILTRO E RENDERIZAÇÃO ---
    filtrar: function() {
        const termo = document.getElementById('search-usuarios')?.value.toLowerCase().trim() || '';
        const exibirInativos = document.getElementById('toggle-inativos')?.checked || false;

        // Filtra a lista completa
        const filtrados = this.listaCompleta.filter(u => {
            // 1. Filtro de Inativos (Se não estiver marcado para exibir, esconde os inativos)
            if (!exibirInativos && !u.ativo) return false;

            // 2. Filtro de Texto (Busca por ID, Nome, Contrato ou Status)
            if (termo) {
                const searchStr = `${u.id} ${u.nome} ${u.contrato} ${u.ativo ? 'ativo' : 'inativo'}`.toLowerCase();
                return searchStr.includes(termo);
            }

            return true;
        });

        this.renderizarTabela(filtrados);
    },

    renderizarTabela: function(lista) {
        const tbody = document.getElementById('lista-usuarios');
        if (!tbody) return;

        let html = '';
        lista.forEach(u => {
            // Estilização (Mantida a mesma)
            const isAtivo = u.ativo;
            const statusClass = isAtivo ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200';
            const statusLabel = isAtivo ? 'ATIVO' : 'INATIVO';

            let contratoClass = 'bg-slate-50 text-slate-600 border-slate-200';
            const contrato = (u.contrato || '').toUpperCase();
            if (contrato === 'CLT') contratoClass = 'bg-blue-50 text-blue-700 border-blue-200';
            else if (contrato === 'PJ') contratoClass = 'bg-sky-50 text-sky-700 border-sky-200';
            else if (contrato === 'AUDITORA') contratoClass = 'bg-purple-50 text-purple-700 border-purple-200';
            else if (contrato === 'GESTORA') contratoClass = 'bg-pink-50 text-pink-700 border-pink-200';
            else if (contrato === 'FINALIZADO') contratoClass = 'bg-gray-100 text-gray-500 border-gray-200';

            const userString = JSON.stringify(u).replace(/"/g, '&quot;');

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-sm group">
                <td class="px-6 py-3 font-mono text-slate-500 font-bold group-hover:text-blue-600 transition">#${u.id}</td>
                <td class="px-6 py-3 font-bold text-slate-700">
                    ${u.nome}
                    ${!isAtivo ? '<span class="ml-2 text-[10px] text-slate-400 font-normal italic">(Inativo)</span>' : ''}
                </td>
                <td class="px-6 py-3">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${contratoClass}">${contrato}</span>
                </td>
                <td class="px-6 py-3 text-center">
                    <span class="px-2 py-1 rounded text-xs font-bold border ${statusClass}">${statusLabel}</span>
                </td>
                <td class="px-6 py-3 text-right flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="Gestao.Usuarios.abrirModal(${userString})" class="p-1.5 text-blue-500 hover:bg-blue-50 rounded transition" title="Editar"><i class="fas fa-edit"></i></button>
                    <button onclick="Gestao.Usuarios.excluir(${u.id})" class="p-1.5 text-red-400 hover:bg-red-50 rounded transition" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        });

        if (lista.length === 0) {
            html = '<tr><td colspan="5" class="text-center py-12 text-slate-400 flex flex-col items-center gap-2"><i class="fas fa-search text-3xl opacity-20"></i><span>Nenhum usuário encontrado com estes filtros.</span></td></tr>';
        }

        tbody.innerHTML = html;
        
        // Atualiza contador se quiser (Opcional)
        const contador = document.getElementById('contador-usuarios');
        if(contador) contador.innerText = `${lista.length} Registros`;
    },

    // --- FUNÇÕES DE MANIPULAÇÃO (Importar, Salvar, Excluir) ---
    // Mantêm-se praticamente iguais, mas chamam this.carregar() no final para atualizar a lista completa

    importar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        input.parentElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';

        try {
            const linhas = await Gestao.lerArquivo(file);
            const mapUsuarios = new Map();
            const hashPadrao = await Sistema.gerarHash('gupy123');

            for (const row of linhas) {
                const c = {};
                Object.keys(row).forEach(k => c[this.normalizarChave(k)] = row[k]);

                const id = parseInt(c['idassistente'] || c['id'] || 0);
                const nome = c['nomeassist'] || c['nome'] || '';
                
                if (!id || !nome) continue;

                const situacaoRaw = (c['situacao'] || c['status'] || 'ATIVO').toUpperCase().trim();
                const contrato = (c['contrato'] || 'CLT').toUpperCase().trim();
                
                let ativo = situacaoRaw === 'ATIVO';
                if (contrato === 'FINALIZADO') ativo = false;

                let funcao = 'ASSISTENTE';
                if (contrato.includes('AUDITORA')) funcao = 'AUDITORA';
                if (contrato.includes('GESTORA')) funcao = 'GESTORA';

                mapUsuarios.set(id, {
                    id: id,
                    nome: String(nome).trim(),
                    contrato: contrato,
                    ativo: ativo,
                    funcao: funcao,
                    perfil: (funcao === 'GESTORA' ? 'admin' : 'user'),
                    senha: hashPadrao
                });
            }

            const upserts = Array.from(mapUsuarios.values());
            if (upserts.length > 0) {
                const { error } = await Sistema.supabase.from('usuarios').upsert(upserts);
                if (error) throw error;
                alert(`Importação concluída!\n${upserts.length} usuários processados.`);
                this.carregar(); // Recarrega tudo
            } else {
                alert("Nenhum dado válido.");
            }
        } catch (e) {
            console.error(e);
            alert("Erro: " + e.message);
        } finally {
            if(Menu.Gestao) Menu.Gestao.atualizarAcao('usuarios'); else location.reload();
        }
    },

    abrirModal: function(usuario = null) {
        // ... (Mesmo código do modal anterior) ...
        // Vou omitir aqui para economizar espaço, mas mantenha a função abrirModal IGUAL à anterior
        // Apenas certifique-se de que o botão 'Salvar' chame Gestao.Usuarios.salvar()
        
        // CÓDIGO DO MODAL COMPLETO ABAIXO PARA GARANTIR QUE NÃO FALTE NADA
        const isEdit = !!usuario;
        const modalAntigo = document.getElementById('modal-usuario');
        if(modalAntigo) modalAntigo.remove();

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
                        <input type="number" id="inp-id" value="${usuario?.id || ''}" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" ${isEdit ? 'disabled class="bg-slate-100 text-slate-500 w-full border border-slate-200 rounded-lg p-2.5 text-sm"' : ''}>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Nome Completo</label>
                        <input type="text" id="inp-nome" value="${usuario?.nome || ''}" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500">
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
                    ${isEdit ? `<div class="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100 flex items-center gap-3"><input type="checkbox" id="inp-reset-senha" class="w-4 h-4 text-amber-600"><label for="inp-reset-senha" class="text-xs font-bold text-amber-800 cursor-pointer">Resetar senha para "gupy123"</label></div>` : ''}
                </div>
                <div class="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                    <button onclick="document.getElementById('modal-usuario').remove()" class="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-bold text-sm transition">Cancelar</button>
                    <button onclick="Gestao.Usuarios.salvar(${isEdit})" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm shadow-md transition">Salvar Usuário</button>
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

        if (!isEdit || resetSenha) payload.senha = await Sistema.gerarHash('gupy123');

        const { error } = await Sistema.supabase.from('usuarios').upsert(payload);
        if (error) alert("Erro: " + error.message);
        else {
            document.getElementById('modal-usuario').remove();
            this.carregar();
        }
    },

    excluir: async function(id) {
        if (!confirm(`Confirma a exclusão do usuário ${id}?`)) return;
        const { error } = await Sistema.supabase.from('usuarios').delete().eq('id', id);
        if (error) alert("Erro ao excluir (possivelmente tem produção vinculada). Tente inativar.");
        else this.carregar();
    },

    normalizarChave: function(k) { return k.trim().toLowerCase().replace(/_/g, '').replace(/ /g, ''); }
};