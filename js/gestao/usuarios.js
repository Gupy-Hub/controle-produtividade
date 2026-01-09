Gestao.Usuarios = {
    carregar: async function() {
        const tbody = document.getElementById('lista-usuarios');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8"><i class="fas fa-spinner fa-spin text-blue-500 text-xl"></i></td></tr>';
        
        // Renderiza botão de Novo Usuário se não existir
        this.renderizarBotaoNovo();

        const { data, error } = await Sistema.supabase.from('usuarios').select('*').order('nome');
        if (error) { console.error(error); return; }

        let html = '';
        data.forEach(u => {
            const statusClass = u.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700';
            const statusLabel = u.ativo ? 'ATIVO' : 'INATIVO';
            
            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-sm">
                <td class="px-6 py-3 font-mono text-slate-500 font-bold">#${u.id}</td>
                <td class="px-6 py-3 font-bold text-slate-700">${u.nome}</td>
                <td class="px-6 py-3 text-slate-600">${u.contrato || '-'}</td>
                <td class="px-6 py-3 text-center"><span class="px-2 py-1 rounded text-xs font-bold ${statusClass}">${statusLabel}</span></td>
                <td class="px-6 py-3 text-right flex justify-end gap-2">
                    <button onclick='Gestao.Usuarios.abrirModal(${JSON.stringify(u)})' class="p-2 text-blue-500 hover:bg-blue-50 rounded transition" title="Editar"><i class="fas fa-edit"></i></button>
                    <button onclick="Gestao.Usuarios.excluir(${u.id})" class="p-2 text-red-400 hover:bg-red-50 rounded transition" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="5" class="text-center py-8 text-slate-400">Nenhum usuário cadastrado. Importe uma planilha ou cadastre manualmente.</td></tr>';
    },

    importar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        try {
            const linhas = await Gestao.lerArquivo(file);
            const upserts = [];
            
            // Senha padrão criptografada
            const hashPadrao = await Sistema.gerarHash('gupy123');

            for (const row of linhas) {
                // Normaliza chaves para garantir leitura
                const c = {};
                Object.keys(row).forEach(k => c[this.normalizarChave(k)] = row[k]);

                // Campos Esperados: ID ASSISTENTE, NOME ASSIST, CONTRATO, SITUAÇÃO
                const id = parseInt(c['idassistente'] || c['id'] || 0);
                const nome = c['nomeassist'] || c['nome'] || '';
                
                if (!id || !nome) continue;

                const situacao = (c['situacao'] || c['status'] || 'ATIVO').toUpperCase();
                const contrato = (c['contrato'] || '').toUpperCase();
                
                // Lógica de Função (Se o contrato for um cargo, usa ele, senão Assistente)
                let funcao = 'ASSISTENTE';
                if (contrato.includes('AUDITORA')) funcao = 'AUDITORA';
                if (contrato.includes('GESTORA')) funcao = 'GESTORA';

                upserts.push({
                    id: id,
                    nome: String(nome).trim(),
                    contrato: contrato,
                    ativo: situacao === 'ATIVO',
                    funcao: funcao, // Campo interno necessário para permissões
                    perfil: (funcao === 'GESTORA' ? 'admin' : 'user'),
                    senha: hashPadrao // Define a senha padrão criptografada
                });
            }

            if (upserts.length > 0) {
                // Upsert no Supabase
                const { error } = await Sistema.supabase.from('usuarios').upsert(upserts);
                if (error) throw error;
                alert(`Processo concluído!\n${upserts.length} usuários importados/atualizados.\nA senha padrão é: gupy123`);
                this.carregar();
            } else {
                alert("Nenhum dado válido encontrado. Verifique se a planilha tem as colunas: ID ASSISTENTE, NOME ASSIST");
            }

        } catch (e) {
            console.error(e);
            alert("Erro na importação: " + e.message);
        } finally {
            input.value = "";
        }
    },

    // --- CADASTRO MANUAL E EDIÇÃO ---
    abrirModal: function(usuario = null) {
        const isEdit = !!usuario;
        // Cria HTML do Modal dinamicamente
        const modalHtml = `
        <div id="modal-usuario" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm animate-fade">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                <h3 class="text-xl font-bold text-slate-800 mb-4 border-b pb-2">${isEdit ? 'Editar Usuário' : 'Novo Usuário'}</h3>
                
                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase">ID (Matrícula)</label>
                        <input type="number" id="inp-id" value="${usuario?.id || ''}" class="w-full border rounded p-2 text-sm" ${isEdit ? 'disabled class="bg-slate-100"' : ''}>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase">Nome Completo</label>
                        <input type="text" id="inp-nome" value="${usuario?.nome || ''}" class="w-full border rounded p-2 text-sm">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase">Contrato</label>
                            <select id="inp-contrato" class="w-full border rounded p-2 text-sm bg-white">
                                <option value="CLT">CLT</option>
                                <option value="PJ">PJ</option>
                                <option value="ESTAGIO">ESTÁGIO</option>
                                <option value="AUDITORA">AUDITORA</option>
                                <option value="GESTORA">GESTORA</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase">Situação</label>
                            <select id="inp-situacao" class="w-full border rounded p-2 text-sm bg-white">
                                <option value="true">ATIVO</option>
                                <option value="false">INATIVO</option>
                            </select>
                        </div>
                    </div>
                    ${isEdit ? `
                    <div class="p-2 bg-amber-50 rounded text-xs text-amber-700 flex items-center gap-2">
                        <input type="checkbox" id="inp-reset-senha">
                        <label for="inp-reset-senha">Resetar senha para <strong>gupy123</strong>?</label>
                    </div>` : ''}
                </div>

                <div class="flex justify-end gap-2 mt-6">
                    <button onclick="document.getElementById('modal-usuario').remove()" class="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded font-bold text-sm">Cancelar</button>
                    <button onclick="Gestao.Usuarios.salvar(${isEdit})" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-sm">Salvar</button>
                </div>
            </div>
        </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Preenche selects se for edição
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

        const payload = {
            id: parseInt(id),
            nome: nome,
            contrato: contrato,
            ativo: ativo,
            funcao: ['GESTORA', 'AUDITORA'].includes(contrato) ? contrato : 'ASSISTENTE'
        };

        // Se for novo ou reset, aplica hash da senha padrão
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
        if (!confirm(`Tem certeza que deseja excluir o usuário ${id}?`)) return;
        const { error } = await Sistema.supabase.from('usuarios').delete().eq('id', id);
        if (error) alert("Erro ao excluir (possui dados vinculados). Tente inativar em vez de excluir.");
        else this.carregar();
    },

    renderizarBotaoNovo: function() {
        // Injeta o botão "Novo" ao lado do título ou filtro se ainda não existir
        const header = document.querySelector('#view-usuarios h2')?.parentNode; // Container do título
        if (header && !document.getElementById('btn-novo-user')) {
             // Cria um botão "Novo +" visualmente atraente
             const btn = document.createElement('button');
             btn.id = 'btn-novo-user';
             btn.className = "bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded text-xs font-bold ml-4 transition shadow-sm";
             btn.innerHTML = '<i class="fas fa-plus"></i> Novo Usuário';
             btn.onclick = () => this.abrirModal();
             header.appendChild(btn); // Adiciona ao lado do título "Importar Usuários"
        }
    },

    normalizarChave: function(k) {
        return k.trim().toLowerCase().replace(/_/g, '').replace(/ /g, '');
    }
};