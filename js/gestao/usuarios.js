Gestao.Usuarios = {
    carregar: async function() {
        const tbody = document.getElementById('lista-usuarios');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8"><i class="fas fa-spinner fa-spin text-blue-500 text-xl"></i></td></tr>';
        
        // Renderiza botão de Novo Usuário se não existir
        this.renderizarBotaoNovo();

        const { data, error } = await Sistema.supabase.from('usuarios').select('*').order('nome');
        if (error) { console.error(error); return; }

        let html = '';
        data.forEach(u => {
            const statusClass = u.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700';
            const statusLabel = u.ativo ? 'ATIVO' : 'INATIVO';
            
            // Escapa aspas para evitar erro no JSON.stringify
            const userString = JSON.stringify(u).replace(/"/g, '&quot;');

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-sm">
                <td class="px-6 py-3 font-mono text-slate-500 font-bold">#${u.id}</td>
                <td class="px-6 py-3 font-bold text-slate-700">${u.nome}</td>
                <td class="px-6 py-3 text-slate-600">${u.contrato || '-'}</td>
                <td class="px-6 py-3 text-center"><span class="px-2 py-1 rounded text-xs font-bold ${statusClass}">${statusLabel}</span></td>
                <td class="px-6 py-3 text-right flex justify-end gap-2">
                    <button onclick="Gestao.Usuarios.abrirModal(${userString})" class="p-2 text-blue-500 hover:bg-blue-50 rounded transition" title="Editar"><i class="fas fa-edit"></i></button>
                    <button onclick="Gestao.Usuarios.excluir(${u.id})" class="p-2 text-red-400 hover:bg-red-50 rounded transition" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        });
        if (tbody) tbody.innerHTML = html || '<tr><td colspan="5" class="text-center py-8 text-slate-400">Nenhum usuário cadastrado. Importe uma planilha ou cadastre manualmente.</td></tr>';
    },

    importar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // Feedback visual
        const labelOriginal = input.parentElement.innerHTML;
        input.parentElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

        try {
            const linhas = await Gestao.lerArquivo(file);
            
            // CORREÇÃO: Usar um Map para garantir unicidade por ID e evitar erro "row a second time"
            const mapUsuarios = new Map();
            const hashPadrao = await Sistema.gerarHash('gupy123');

            for (const row of linhas) {
                // Normaliza chaves
                const c = {};
                Object.keys(row).forEach(k => c[this.normalizarChave(k)] = row[k]);

                // Campos Obrigatórios
                const id = parseInt(c['idassistente'] || c['id'] || 0);
                const nome = c['nomeassist'] || c['nome'] || '';
                
                if (!id || !nome) continue;

                const situacao = (c['situacao'] || c['status'] || 'ATIVO').toUpperCase().trim();
                const contrato = (c['contrato'] || 'CLT').toUpperCase().trim();
                
                let funcao = 'ASSISTENTE';
                if (contrato.includes('AUDITORA')) funcao = 'AUDITORA';
                if (contrato.includes('GESTORA')) funcao = 'GESTORA';

                // Adiciona ao Map (se o ID já existir, sobrescreve com o último da lista)
                mapUsuarios.set(id, {
                    id: id,
                    nome: String(nome).trim(),
                    contrato: contrato,
                    ativo: situacao === 'ATIVO',
                    funcao: funcao,
                    perfil: (funcao === 'GESTORA' ? 'admin' : 'user'),
                    senha: hashPadrao // Senha padrão criptografada
                });
            }

            // Converte o Map de volta para Array
            const upserts = Array.from(mapUsuarios.values());

            if (upserts.length > 0) {
                const { error } = await Sistema.supabase.from('usuarios').upsert(upserts);
                if (error) throw error;
                
                alert(`Sucesso! ${upserts.length} usuários processados (duplicatas removidas).`);
                this.carregar();
            } else {
                alert("Nenhum dado válido encontrado. Verifique as colunas da planilha.");
            }

        } catch (e) {
            console.error(e);
            alert("Erro na importação: " + (e.message || e.details || e));
        } finally {
            // Restaura o botão e limpa o input
            // Como alteramos o innerHTML, precisamos recriar o input para funcionar de novo
            const parent = document.querySelector('#gestao-actions'); 
            if(Menu.Gestao) Menu.Gestao.atualizarAcao('usuarios'); 
            else location.reload(); // Fallback se o menu falhar
        }
    },

    // --- CADASTRO MANUAL E EDIÇÃO ---
    abrirModal: function(usuario = null) {
        const isEdit = !!usuario;
        
        // Remove modal anterior se existir
        const modalAntigo = document.getElementById('modal-usuario');
        if(modalAntigo) modalAntigo.remove();

        const modalHtml = `
        <div id="modal-usuario" class="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center backdrop-blur-sm animate-fade">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                <h3 class="text-xl font-bold text-slate-800 mb-4 border-b pb-2">${isEdit ? 'Editar Usuário' : 'Novo Usuário'}</h3>
                
                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase">ID (Matrícula)</label>
                        <input type="number" id="inp-id" value="${usuario?.id || ''}" class="w-full border rounded p-2 text-sm outline-none focus:border-blue-500" ${isEdit ? 'disabled class="bg-slate-100 w-full border rounded p-2 text-sm"' : ''}>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase">Nome Completo</label>
                        <input type="text" id="inp-nome" value="${usuario?.nome || ''}" class="w-full border rounded p-2 text-sm outline-none focus:border-blue-500">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase">Contrato</label>
                            <select id="inp-contrato" class="w-full border rounded p-2 text-sm bg-white outline-none focus:border-blue-500">
                                <option value="CLT">CLT</option>
                                <option value="PJ">PJ</option>
                                <option value="ESTAGIO">ESTÁGIO</option>
                                <option value="AUDITORA">AUDITORA</option>
                                <option value="GESTORA">GESTORA</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase">Situação</label>
                            <select id="inp-situacao" class="w-full border rounded p-2 text-sm bg-white outline-none focus:border-blue-500">
                                <option value="true">ATIVO</option>
                                <option value="false">INATIVO</option>
                            </select>
                        </div>
                    </div>
                    ${isEdit ? `
                    <div class="p-3 bg-amber-50 rounded text-xs text-amber-800 flex items-center gap-2 border border-amber-100">
                        <input type="checkbox" id="inp-reset-senha" class="accent-amber-600 w-4 h-4">
                        <label for="inp-reset-senha" class="cursor-pointer font-bold">Resetar senha para "gupy123"?</label>
                    </div>` : ''}
                </div>

                <div class="flex justify-end gap-2 mt-6">
                    <button onclick="document.getElementById('modal-usuario').remove()" class="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded font-bold text-sm transition">Cancelar</button>
                    <button onclick="Gestao.Usuarios.salvar(${isEdit})" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-sm shadow-md transition">Salvar</button>
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
            nome: nome,
            contrato: contrato,
            ativo: ativo,
            funcao: funcao,
            perfil: (funcao === 'GESTORA' ? 'admin' : 'user')
        };

        // Aplica hash se for novo usuário ou reset solicitado
        if (!isEdit || resetSenha) {
            payload.senha = await Sistema.gerarHash('gupy123');
        }

        const { error } = await Sistema.supabase.from('usuarios').upsert(payload);
        
        if (error) alert("Erro ao salvar: " + error.message);
        else {
            alert("Salvo com sucesso!");
            document.getElementById('modal-usuario').remove();
            this.carregar();
        }
    },

    excluir: async function(id) {
        if (!confirm(`Tem certeza que deseja excluir o usuário ${id}?\nIsso pode falhar se houver produção vinculada.`)) return;
        
        const { error } = await Sistema.supabase.from('usuarios').delete().eq('id', id);
        
        if (error) alert("Não foi possível excluir (provavelmente o usuário possui histórico de produção).\nSugestão: Edite e mude a situação para INATIVO.");
        else this.carregar();
    },

    renderizarBotaoNovo: function() {
        const header = document.querySelector('#view-usuarios');
        // Evita duplicar se a função for chamada várias vezes
        if (header && !document.getElementById('btn-novo-user-float')) {
             // Vamos inserir o botão na área de dicas ou criar um container
             // Como o layout é controlado pelo Menu Gestão, o botão 'Novo' idealmente deveria estar lá.
             // Mas como fallback, deixaremos um botão flutuante ou no rodapé da tabela.
        }
    },

    normalizarChave: function(k) {
        return k.trim().toLowerCase().replace(/_/g, '').replace(/ /g, '');
    }
};