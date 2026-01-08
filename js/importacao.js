// 1. GARANTE QUE O OBJETO GLOBAL EXISTA (Corrige o erro "Produtividade is not defined")
window.Produtividade = window.Produtividade || {};

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
        // Tenta encontrar o botão pelo onclick ou pega o primeiro botão na barra (fallback)
        const btn = document.querySelector('button[onclick*="importarEmMassa"]') || input.nextElementSibling;
        let originalText = '';
        
        if(btn) {
            originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...';
            btn.disabled = true;
        }

        let totalImportado = 0;
        let erros = 0;

        try {
            // 1. Busca usuários
            const { data: usersData, error: userError } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome');

            if (userError) throw new Error("Erro ao buscar usuários: " + userError.message);

            const mapaUsuarios = {};
            usersData.forEach(u => {
                if (u.nome) mapaUsuarios[u.nome.trim().toLowerCase()] = u.id;
            });

            // 2. Processa arquivos
            for (const file of files) {
                const linhas = await this.processarArquivo(file);
                const payload = [];
                
                for (let i = 1; i < linhas.length; i++) {
                    const row = linhas[i];
                    if (!row || row.length === 0) continue;

                    const nomeExcel = row[0]; 
                    const dataExcel = row[1]; 
                    const qtd = row[2];       
                    
                    const fifo = row[3] || 0;
                    const gTotal = row[4] || 0;
                    const gParcial = row[5] || 0;
                    const perfilFc = row[6] || 0;

                    if (!nomeExcel || !dataExcel) continue;

                    const nomeBusca = String(nomeExcel).trim().toLowerCase();
                    const usuarioId = mapaUsuarios[nomeBusca];

                    if (usuarioId) {
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
            
            if(Produtividade && Produtividade.Geral && typeof Produtividade.Geral.carregarTela === 'function') {
                Produtividade.Geral.carregarTela();
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

// 2. CORREÇÃO GLOBAL (Corrige o erro "Importacao is not defined" no main.js antigo)
window.Importacao = Produtividade.Importacao;

// 3. Atalho para o HTML chamar direto
window.Produtividade.importarEmMassa = (el) => Produtividade.Importacao.importarEmMassa(el);