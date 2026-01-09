window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Assertividade = {
    executar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // Feedback Visual Inicial
        const btnLabel = input.parentElement;
        const originalHtml = btnLabel.innerHTML;
        const atualizarStatus = (texto) => {
            btnLabel.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${texto}`;
        };
        
        btnLabel.classList.add('opacity-50', 'cursor-not-allowed');
        atualizarStatus("Lendo arquivo...");

        // Pequeno delay para a UI atualizar antes de travar no processamento pesado
        await new Promise(r => setTimeout(r, 50));

        try {
            // 1. Carrega dados auxiliares (Cache)
            const { data: usersData } = await Sistema.supabase.from('usuarios').select('id, nome');
            const { data: empData } = await Sistema.supabase.from('empresas').select('id, nome, subdominio');

            // Mapas otimizados para O(1)
            const mapUsuariosID = new Map();
            const mapUsuariosNome = new Map();
            usersData.forEach(u => {
                mapUsuariosID.set(u.id, u.id);
                mapUsuariosNome.set(this.normalizar(u.nome), u.id);
            });

            const mapEmpresas = new Map();
            empData.forEach(e => {
                const nomeOficial = e.nome;
                mapEmpresas.set(this.normalizar(e.nome), nomeOficial);
                if(e.subdominio) mapEmpresas.set(this.normalizar(e.subdominio), nomeOficial);
            });

            // 2. Leitura do Arquivo
            const linhas = await Gestao.lerArquivo(file);
            
            atualizarStatus(`Processando ${linhas.length} linhas...`);
            await new Promise(r => setTimeout(r, 10)); // Yield UI

            const inserts = [];
            let stats = { total: linhas.length, sucesso: 0, ignorados: 0 };

            // 3. Processamento em Memória (Rápido)
            for (const row of linhas) {
                const c = {};
                // Normaliza chaves apenas uma vez
                for (const k in row) c[this.normalizarKey(k)] = row[k];

                // --- LÓGICA DE ID (Prioridade ID > Nome) ---
                let idPlanilha = parseInt(c['idassistente'] || c['id'] || c['idusuario'] || 0);
                let usuarioId = null;

                if (idPlanilha && mapUsuariosID.has(idPlanilha)) {
                    usuarioId = idPlanilha;
                } else {
                    const nomeAssist = c['assistente'] || c['usuario'] || '';
                    if (nomeAssist) usuarioId = mapUsuariosNome.get(this.normalizar(nomeAssist));
                }

                if (!usuarioId) {
                    stats.ignorados++;
                    continue; 
                }

                // --- EMPRESA ---
                const nomeEmpresaRaw = c['empresa'] || '';
                const empresaOficial = mapEmpresas.get(this.normalizar(nomeEmpresaRaw)) || nomeEmpresaRaw;

                // --- DATA ---
                let dataRef = null;
                let horaRef = null;
                const rawDate = c['endtime'] || c['data'] || c['date'] || c['datadaauditoria'];
                
                if (rawDate) {
                    // Tenta parser rápido
                    if (typeof rawDate === 'object') { // Se já for Date
                        dataRef = rawDate.toISOString().split('T')[0];
                        horaRef = rawDate.toLocaleTimeString('pt-BR');
                    } else {
                        try {
                            const dObj = new Date(rawDate);
                            if (!isNaN(dObj)) {
                                dataRef = dObj.toISOString().split('T')[0];
                                horaRef = dObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                            }
                        } catch(e) {}
                    }
                }

                if (!dataRef) {
                    stats.ignorados++;
                    continue;
                }

                // Push direto no array
                inserts.push({
                    usuario_id: usuarioId,
                    data_referencia: dataRef,
                    hora: horaRef,
                    empresa: empresaOficial,
                    nome_documento: c['docname'] || c['documento'] || '',
                    status: c['status'] || '',
                    observacao: c['apontamentosobs'] || c['obs'] || c['apontamentos'] || '',
                    num_campos: parseInt(c['ncampos'] || c['numerocampos'] || 0),
                    qtd_ok: parseInt(c['ok'] || 0),
                    nok: parseInt(c['nok'] || 0),
                    assertividade: c['%assert'] || c['assertividade'] || '',
                    auditora: c['auditora'] || '',
                    quantidade: 1, 
                    fator: 1
                });
            }

            // 4. Envio Paralelo Otimizado
            if (inserts.length > 0) {
                const totalRegistros = inserts.length;
                const batchSize = 2000; // Aumentado para 2000 por lote
                const lotes = [];

                // Divide em fatias
                for (let i = 0; i < totalRegistros; i += batchSize) {
                    lotes.push(inserts.slice(i, i + batchSize));
                }

                let processados = 0;
                
                // Função para processar lotes em paralelo controlado
                // Limitamos a 5 requisições simultâneas para não estourar o pool de conexões
                const limiteConcorrencia = 5;
                
                for (let i = 0; i < lotes.length; i += limiteConcorrencia) {
                    const chunk = lotes.slice(i, i + limiteConcorrencia);
                    
                    // Dispara até 5 requisições ao mesmo tempo
                    const promessas = chunk.map(lote => Sistema.supabase.from('producao').insert(lote));
                    
                    // Espera todas as 5 terminarem
                    const resultados = await Promise.all(promessas);
                    
                    // Verifica erros
                    resultados.forEach(res => { if (res.error) throw res.error; });

                    processados += chunk.reduce((acc, curr) => acc + curr.length, 0);
                    
                    // Atualiza UI
                    const pct = Math.round((processados / totalRegistros) * 100);
                    atualizarStatus(`Salvando... ${pct}%`);
                }

                stats.sucesso = processados;
                
                let msg = `Finalizado com Sucesso!\n\n`;
                msg += `✅ Registros Salvos: ${stats.sucesso}\n`;
                msg += `⚠️ Linhas Ignoradas: ${stats.ignorados} (Sem ID/Assistente ou Data)`;
                
                alert(msg);

                if (Gestao.Assertividade) Gestao.Assertividade.carregar();
            } else {
                alert("Nenhum registro válido identificado para importação.");
            }

        } catch (e) {
            console.error(e);
            alert("Erro durante o processamento: " + e.message);
        } finally {
            btnLabel.innerHTML = originalHtml;
            btnLabel.classList.remove('opacity-50', 'cursor-not-allowed');
            input.value = "";
        }
    },

    normalizar: function(str) {
        return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/ /g, '');
    },

    normalizarKey: function(k) {
        return String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    }
};