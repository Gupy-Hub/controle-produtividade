Produtividade.Importacao = {
    
    processarArquivo: async function(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                    resolve(jsonData);
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    },

    importarEmMassa: async function(input) {
        if (!input.files || input.files.length === 0) return;

        const files = Array.from(input.files);
        const btn = document.querySelector('button[onclick*="importarEmMassa"]');
        const originalText = btn.innerHTML;
        
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...';
        btn.disabled = true;

        let totalImportado = 0;
        let erros = 0;

        try {
            // 1. Busca TODOS os usuários cadastrados no sistema (Assistentes, Auditoras, Gestoras)
            // Normaliza os nomes para minúsculas para facilitar o "match"
            const { data: usersData, error: userError } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome');

            if (userError) throw new Error("Erro ao buscar cadastro de usuários: " + userError.message);

            // Cria um mapa para busca rápida: "nome do usuario" -> "id"
            const mapaUsuarios = {};
            usersData.forEach(u => {
                if (u.nome) mapaUsuarios[u.nome.trim().toLowerCase()] = u.id;
            });

            // 2. Processa cada arquivo selecionado
            for (const file of files) {
                const linhas = await this.processarArquivo(file);
                
                // Pula cabeçalho (i=1)
                const payload = [];
                for (let i = 1; i < linhas.length; i++) {
                    const row = linhas[i];
                    if (!row || row.length === 0) continue;

                    // Ajuste as colunas conforme seu Excel padrão. 
                    // Exemplo: Col A=Nome, Col B=Data, Col C=Qtd...
                    // Modifique os índices [0], [1] conforme sua planilha real.
                    
                    const nomeExcel = row[0]; // Nome do Colaborador
                    const dataExcel = row[1]; // Data
                    const qtd = row[2];       // Quantidade Produzida
                    
                    // Outras colunas opcionais (ajuste conforme seu excel)
                    const fifo = row[3] || 0;
                    const gTotal = row[4] || 0;
                    const gParcial = row[5] || 0;
                    const perfilFc = row[6] || 0;

                    if (!nomeExcel || !dataExcel) continue;

                    // Busca o ID do usuário pelo nome
                    const nomeBusca = String(nomeExcel).trim().toLowerCase();
                    const usuarioId = mapaUsuarios[nomeBusca];

                    if (usuarioId) {
                        // Trata data do Excel (se vier como número serial ou string)
                        let dataFormatada = dataExcel;
                        if (typeof dataExcel === 'number') {
                            const dateObj = XLSX.SSF.parse_date_code(dataExcel);
                            dataFormatada = `${dateObj.y}-${String(dateObj.m).padStart(2,'0')}-${String(dateObj.d).padStart(2,'0')}`;
                        }

                        payload.push({
                            usuario_id: usuarioId,
                            data_referencia: dataFormatada,
                            quantidade: Number(qtd) || 0,
                            fifo: Number(fifo) || 0,
                            gradual_total: Number(gTotal) || 0,
                            gradual_parcial: Number(gParcial) || 0,
                            perfil_fc: Number(perfilFc) || 0,
                            fator: 1 // Padrão 100% ao importar
                        });
                    }
                }

                // Insere no banco em lotes
                if (payload.length > 0) {
                    const { error } = await Sistema.supabase
                        .from('producao')
                        .upsert(payload, { onConflict: 'usuario_id, data_referencia' }); // Evita duplicidade no mesmo dia

                    if (error) {
                        console.error("Erro ao inserir lote:", error);
                        erros++;
                    } else {
                        totalImportado += payload.length;
                    }
                }
            }

            alert(`Processamento concluído!\nImportados/Atualizados: ${totalImportado} registros.\nArquivos com erro: ${erros}`);
            
            // Recarrega a tela para mostrar os dados novos
            if(Produtividade && Produtividade.Geral) {
                Produtividade.Geral.carregarTela();
            }

        } catch (e) {
            console.error(e);
            alert("Erro fatal na importação: " + e.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
            input.value = ""; // Limpa input para permitir re-upload do mesmo arquivo
        }
    }
};

// Vincula ao escopo global se necessário
window.Produtividade = window.Produtividade || {};
window.Produtividade.importarEmMassa = (el) => Produtividade.Importacao.importarEmMassa(el);