Gestao.Empresas = {
    carregar: async function() {
        try {
            const { data, error } = await Gestao.supabase.from('empresas').select('*').order('nome');
            const container = document.getElementById('lista-empresas');
            
            if (error) {
                console.warn("Erro ao buscar empresas:", error);
                // Se der 404, avisa para criar a tabela
                if (error.code === '404' || error.message.includes('not exist')) {
                    container.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500 font-bold">⚠️ A tabela 'empresas' não foi criada no Supabase.<br>Execute o script SQL fornecido.</td></tr>`;
                    return;
                }
                throw error;
            }

            Gestao.dados.empresas = data || [];
            this.renderizar(Gestao.dados.empresas);
        } catch (err) { 
            console.error(err);
            document.getElementById('lista-empresas').innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500">Erro de conexão: ${err.message}</td></tr>`;
        }
    },

    renderizar: function(lista) {
        const container = document.getElementById('lista-empresas');
        if (lista.length === 0) {
            container.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400 text-xs">Nenhuma empresa cadastrada. Importe o arquivo CSV.</td></tr>`;
            return;
        }

        let html = '';
        lista.forEach(e => {
            // Formata data YYYY-MM-DD para DD/MM/YYYY
            const dataFmt = e.data_entrada ? e.data_entrada.split('-').reverse().join('/') : '-';
            const empresaJson = JSON.stringify(e).replace(/"/g, '&quot;');
            
            // Tratamento para observação longa
            const obsCurta = e.observacao && e.observacao.length > 30 ? e.observacao.substring(0, 30) + '...' : (e.observacao || '-');

            html += `
            <tr class="hover:bg-slate-50 transition border-b border-slate-50 group text-xs">
                <td class="px-6 py-3 font-bold text-slate-600">#${e.id}</td>
                <td class="px-6 py-3 font-bold text-slate-800 text-sm">${e.nome}</td>
                <td class="px-6 py-3 text-blue-600 font-mono bg-blue-50/30 rounded px-2 w-fit">${e.subdominio || '-'}</td>
                <td class="px-6 py-3 text-center text-slate-500">${dataFmt}</td>
                <td class="px-6 py-3 text-slate-500" title="${e.observacao || ''}">${obsCurta}</td>
                <td class="px-6 py-3 text-center">
                    <button onclick="Gestao.Empresas.abrirModal(${empresaJson})" class="text-slate-400 hover:text-blue-600 transition p-2 rounded hover:bg-white border border-transparent hover:border-slate-100">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>`;
        });
        container.innerHTML = html;
    },

    filtrar: function() {
        const term = document.getElementById('search-empresa').value.toLowerCase();
        const filtered = Gestao.dados.empresas.filter(e => 
            e.nome.toLowerCase().includes(term) || 
            String(e.id).includes(term) ||
            (e.subdominio && e.subdominio.toLowerCase().includes(term))
        );
        this.renderizar(filtered);
    },

    // --- IMPORTAÇÃO DE EMPRESAS ---
    importar: async function(input) {
        const file = input.files[0];
        if (!file) return;
        if(!confirm("Deseja importar o arquivo de EMPRESAS?\n\nIsso irá cadastrar novas empresas e atualizar as existentes pelo ID.")) { input.value = ""; return; }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                let workbook;
                try { 
                    // Tenta ler padrão
                    workbook = XLSX.read(data, { type: 'array' }); 
                } catch { 
                    // Fallback para CSV texto (comum em arquivos brasileiros)
                    const dec = new TextDecoder('iso-8859-1'); 
                    workbook = XLSX.read(dec.decode(data), { type: 'string', raw: true }); 
                }
                
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet);
                await this.processarImportacao(json);
            } catch (err) { alert("Erro ao ler arquivo: " + err.message); }
            input.value = "";
        };
        reader.readAsArrayBuffer(file);
    },

    processarImportacao: async function(linhas) {
        // Função para normalizar chaves do objeto (remove acentos, espaços extras e lowercase)
        const norm = t => t ? t.toString().toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, "") : "";
        
        const upserts = [];
        let erros = 0;

        for (const row of linhas) {
            const keys = Object.keys(row);
            
            // Mapeamento flexível das colunas baseado no seu CSV
            const kId = keys.find(k => ['id empresa', 'id', 'cod'].includes(norm(k)));
            const kNome = keys.find(k => ['nome', 'nome da empresa', 'empresa'].includes(norm(k)));
            const kSub = keys.find(k => ['subdominio', 'dominio'].includes(norm(k)));
            const kData = keys.find(k => ['entrou para mesa', 'data', 'inicio', 'data entrada'].includes(norm(k)));
            const kObs = keys.find(k => ['obs', 'observacao'].includes(norm(k)));

            if (!kId || !kNome) continue; // Pula se não achar ID ou Nome

            // Conversão de valores
            const id = parseInt(row[kId]);
            const nome = row[kNome] ? row[kNome].toString().trim() : "";
            const sub = kSub && row[kSub] ? row[kSub].toString().trim() : null;
            const obs = kObs && row[kObs] ? row[kObs].toString().trim() : null;
            
            // Tratamento de Data
            let dataEntrada = null;
            if (kData && row[kData]) {
                let d = row[kData].toString().trim();
                // Se for formato Excel numérico (serial), o XLSX geralmente já converte se configurado, 
                // mas lendo RAW pode vir string. O seu CSV parece ter "YYYY-MM-DD" ou vazio.
                
                // Tenta validar ISO YYYY-MM-DD
                if (d.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    dataEntrada = d;
                } 
                // Tenta validar BR DD/MM/YYYY
                else if (d.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                    const parts = d.split('/');
                    dataEntrada = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
            }

            if (!id || !nome) {
                erros++;
                continue;
            }

            upserts.push({
                id: id,
                nome: nome,
                subdominio: sub,
                data_entrada: dataEntrada,
                observacao: obs
            });
        }

        try {
            if (upserts.length > 0) {
                // Envia em lotes para não sobrecarregar
                const { error } = await Gestao.supabase.from('empresas').upsert(upserts);
                
                if (error) throw error;
                
                alert(`✅ Importação concluída com sucesso!\n\n🏢 Empresas processadas: ${upserts.length}`);
                this.carregar(); // Recarrega a tabela na tela
            } else {
                alert("⚠️ Nenhuma empresa válida foi encontrada no arquivo. Verifique os nomes das colunas.");
            }
        } catch (err) { 
            console.error(err);
            alert("Erro ao salvar no banco: " + err.message); 
        }
    },

    // --- MODAL CRUD ---
    abrirModal: function(empresa = null) {
        const m = document.getElementById('modal-empresa');
        m.classList.remove('hidden'); m.classList.add('flex');
        
        const btnDel = document.getElementById('btn-empresa-delete');
        const inputId = document.getElementById('form-empresa-id');

        if (empresa) {
            document.getElementById('modal-empresa-title').innerText = "Editar Empresa";
            inputId.value = empresa.id; inputId.disabled = true; inputId.classList.add('bg-slate-100');
            document.getElementById('form-empresa-nome').value = empresa.nome;
            document.getElementById('form-empresa-sub').value = empresa.subdominio || '';
            document.getElementById('form-empresa-data').value = empresa.data_entrada || '';
            document.getElementById('form-empresa-obs').value = empresa.observacao || '';
            btnDel.classList.remove('hidden');
        } else {
            document.getElementById('modal-empresa-title').innerText = "Nova Empresa";
            inputId.value = ""; inputId.disabled = false; inputId.classList.remove('bg-slate-100');
            document.getElementById('form-empresa-nome').value = "";
            document.getElementById('form-empresa-sub').value = "";
            // Define data de hoje como padrão se for novo
            document.getElementById('form-empresa-data').value = new Date().toISOString().substring(0, 10);
            document.getElementById('form-empresa-obs').value = "";
            btnDel.classList.add('hidden');
        }
    },

    salvar: async function() {
        const id = document.getElementById('form-empresa-id').value;
        const nome = document.getElementById('form-empresa-nome').value;
        const sub = document.getElementById('form-empresa-sub').value;
        const data = document.getElementById('form-empresa-data').value;
        const obs = document.getElementById('form-empresa-obs').value;
        
        if (!id || !nome) return alert("ID e Nome são obrigatórios.");

        // Animação do botão
        const btn = document.querySelector('#modal-empresa button.bg-blue-600');
        const txtOriginal = btn.innerText;
        btn.innerText = "Salvando...";
        btn.disabled = true;

        try {
            const payload = {
                id: parseInt(id),
                nome: nome,
                subdominio: sub || null,
                data_entrada: data || null,
                observacao: obs || null
            };

            const { error } = await Gestao.supabase.from('empresas').upsert(payload);
            if (error) throw error;

            Gestao.fecharModais();
            this.carregar();
        } catch (err) {
            alert("Erro ao salvar: " + err.message);
        } finally {
            btn.innerText = txtOriginal;
            btn.disabled = false;
        }
    },

    excluir: async function() {
        const id = document.getElementById('form-empresa-id').value;
        if (!confirm(`Tem certeza que deseja excluir a empresa ID ${id}?`)) return;

        try {
            const { error } = await Gestao.supabase.from('empresas').delete().eq('id', id);
            if (error) throw error;
            Gestao.fecharModais();
            this.carregar();
        } catch (err) {
            alert("Erro ao excluir: " + err.message);
        }
    }
};