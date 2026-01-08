// Garante que o objeto global exista
window.Produtividade = window.Produtividade || {};

Produtividade.Importacao = {
    
    // Função auxiliar para normalizar texto (remove acentos e espaços)
    normalizar: function(texto) {
        if (!texto) return "";
        return String(texto)
            .trim()
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, ""); 
    },

    // Processa o arquivo Excel e retorna JSON
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

    // Mantém compatibilidade caso o main.js antigo tente chamar lerArquivo
    lerArquivo: function(file) {
        return this.processarArquivo(file);
    },

    importarEmMassa: async function(input) {
        if (!input.files || input.files.length === 0) return;

        const files = Array.from(input.files);
        // Tenta pegar o botão que chamou ou o próximo elemento
        const btn = document.querySelector('button[onclick*="importarEmMassa"]') || 
                    (input.nextElementSibling && input.nextElementSibling.tagName === 'BUTTON' ? input.nextElementSibling : null);
        
        let originalText = '';
        if(btn) {
            originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...';
            btn.disabled = true;
        }

        let totalImportado = 0;
        let erros = 0;

        try {
            // 1. Busca usuários para mapear ID
            const { data: usersData, error: userError } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome');

            if (userError) throw new Error("Erro ao buscar usuários: " + userError.message);

            const mapaUsuarios = {};
            usersData.forEach(u => {
                if (u.nome) mapaUsuarios[this.normalizar(u.nome)] = u.id;
            });

            // 2. Processa cada arquivo
            for (const file of files) {
                const linhas = await this.processarArquivo(file);
                const payload = [];
                
                // Pula cabeçalho (i=1)
                for (let i = 1; i < linhas.length; i++) {
                    const row = linhas[i];
                    if (!row || row.length === 0) continue;

                    // Mapeamento de colunas (Ajuste conforme seu Excel)
                    const nomeExcel = row[0]; 
                    const dataExcel = row[1]; 
                    const qtd = row[2];       
                    
                    const fifo = row[3] || 0;
                    const gTotal = row[4] || 0;
                    const gParcial = row[5] || 0;
                    const perfilFc = row[6] || 0;

                    if (!nomeExcel || !dataExcel) continue;

                    const nomeBusca = this.normalizar(nomeExcel);
                    const usuarioId = mapaUsuarios[nomeBusca];

                    if (usuarioId) {
                        let dataFormatada = dataExcel;
                        // Tratamento para datas do Excel (número serial)
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
                            fator: 1
                        });
                    }
                }

                if (payload.length > 0) {
                    const { error } = await Sistema.supabase
                        .from('producao')
                        .upsert(payload, { onConflict: 'usuario_id, data_referencia' });

                    if (error) {
                        console.error("Erro SQL:", error);
                        erros++;
                    } else {
                        totalImportado += payload.length;
                    }
                }
            }

            alert(`Importação concluída!\nRegistros processados: ${totalImportado}\nErros de arquivo: ${erros}`);
            
            // Recarrega a tela atual se possível
            if(window.Produtividade && window.Produtividade.Geral && typeof window.Produtividade.Geral.carregarTela === 'function') {
                window.Produtividade.Geral.carregarTela();
            } else {
                location.reload();
            }

        } catch (e) {
            console.error(e);
            alert("Erro na importação: " + e.message);
        } finally {
            if(btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
            input.value = ""; 
        }
    }
};

// Expondo globalmente para evitar erros de referência
window.Importacao = Produtividade.Importacao;
window.Produtividade.importarEmMassa = (el) => Produtividade.Importacao.importarEmMassa(el);